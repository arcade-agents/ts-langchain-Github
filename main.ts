"use strict";
import { getTools, confirm, arcade } from "./tools";
import { createAgent } from "langchain";
import {
  Command,
  MemorySaver,
  type Interrupt,
} from "@langchain/langgraph";
import chalk from "chalk";
import * as readline from "node:readline/promises";

// configure your own values to customize your agent

// The Arcade User ID identifies who is authorizing each service.
const arcadeUserID = process.env.ARCADE_USER_ID;
if (!arcadeUserID) {
  throw new Error("Missing ARCADE_USER_ID. Add it to your .env file.");
}
// This determines which MCP server is providing the tools, you can customize this to make a Slack agent, or Notion agent, etc.
// all tools from each of these MCP servers will be retrieved from arcade
const toolkits=['Github'];
// This determines isolated tools that will be
const isolatedTools=[];
// This determines the maximum number of tool definitions Arcade will return
const toolLimit = 100;
// This prompt defines the behavior of the agent.
const systemPrompt = `# Introduction
Welcome to the AI GitHub Assistant! This agent is designed to help developers efficiently manage their GitHub repositories by leveraging various tools available through the GitHub API. The agent can create issues, pull requests, merge branches, manage reviews, and much more, streamlining your development workflow.

# Instructions
1. Identify the task you want to accomplish. This could include creating a new issue, assigning reviewers to a pull request, merging a pull request, or fetching repository details.
2. Clearly specify the necessary parameters related to your task. This may include repository names, user identifiers, pull request numbers, and any other relevant details.
3. The agent will use the appropriate tools based on your request to perform the desired action and provide you with feedback, updates, or status messages accordingly.

# Workflows
## 1. Creating a New Issue
   - **Tools Used:** `Github_CreateIssue`
   - **Sequence:**
     1. Gather repository owner, repo name, issue title, and optional issue body.
     2. Call `Github_CreateIssue` with the collected parameters.

## 2. Creating a Pull Request
   - **Tools Used:** `Github_CreatePullRequest`
   - **Sequence:**
     1. Collect repository owner, repo name, PR title, head branch, and base branch.
     2. Call `Github_CreatePullRequest` to create the pull request.

## 3. Merging a Pull Request
   - **Tools Used:** `Github_MergePullRequest`, `Github_CheckPullRequestMergeStatus`
   - **Sequence:**
     1. Gather the repository owner, repo name, and pull request number.
     2. Call `Github_CheckPullRequestMergeStatus` to check if the PR is ready to merge.
     3. If ready, call `Github_MergePullRequest` to merge the PR.

## 4. Assigning Reviewers to a Pull Request
   - **Tools Used:** `Github_ManagePullRequestReviewers`
   - **Sequence:**
     1. Collect repository owner, repo name, pull request number, and reviewers' usernames.
     2. Call `Github_ManagePullRequestReviewers` to add the specified reviewers.

## 5. Listing Pull Requests
   - **Tools Used:** `Github_ListPullRequests`
   - **Sequence:**
     1. Gather repository owner and repo name, along with optional filters for state and sorting.
     2. Call `Github_ListPullRequests` to retrieve the list of pull requests.

## 6. Getting Repository Details
   - **Tools Used:** `Github_GetRepository`
   - **Sequence:**
     1. Collect the repository owner and repo name.
     2. Call `Github_GetRepository` to fetch details about the repository.

## 7. Listing Issues
   - **Tools Used:** `Github_ListIssues`
   - **Sequence:**
     1. Gather repository owner, repo name, and optional filters like state and labels.
     2. Call `Github_ListIssues` to list issues in the repository.

Each workflow is designed to be straightforward and efficient, allowing for rapid execution of tasks while ensuring accuracy and reliability through the use of the specified tools.`;
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";

const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});



async function handleInterrupt(
  interrupt: Interrupt,
  rl: readline.Interface
): Promise<{ authorized: boolean }> {
  const value = interrupt.value;
  const authorization_required = value.authorization_required;
  const hitl_required = value.hitl_required;
  if (authorization_required) {
    const tool_name = value.tool_name;
    const authorization_response = value.authorization_response;
    console.log("⚙️: Authorization required for tool call", tool_name);
    console.log(
      "⚙️: Please authorize in your browser",
      authorization_response.url
    );
    console.log("⚙️: Waiting for you to complete authorization...");
    try {
      await arcade.auth.waitForCompletion(authorization_response.id);
      console.log("⚙️: Authorization granted. Resuming execution...");
      return { authorized: true };
    } catch (error) {
      console.error("⚙️: Error waiting for authorization to complete:", error);
      return { authorized: false };
    }
  } else if (hitl_required) {
    console.log("⚙️: Human in the loop required for tool call", value.tool_name);
    console.log("⚙️: Please approve the tool call", value.input);
    const approved = await confirm("Do you approve this tool call?", rl);
    return { authorized: approved };
  }
  return { authorized: false };
}

const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});

async function streamAgent(
  agent: any,
  input: any,
  config: any
): Promise<Interrupt[]> {
  const stream = await agent.stream(input, {
    ...config,
    streamMode: "updates",
  });
  const interrupts: Interrupt[] = [];

  for await (const chunk of stream) {
    if (chunk.__interrupt__) {
      interrupts.push(...(chunk.__interrupt__ as Interrupt[]));
      continue;
    }
    for (const update of Object.values(chunk)) {
      for (const msg of (update as any)?.messages ?? []) {
        console.log("🤖: ", msg.toFormattedString());
      }
    }
  }

  return interrupts;
}

async function main() {
  const config = { configurable: { thread_id: threadID } };
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.green("Welcome to the chatbot! Type 'exit' to quit."));
  while (true) {
    const input = await rl.question("> ");
    if (input.toLowerCase() === "exit") {
      break;
    }
    rl.pause();

    try {
      let agentInput: any = {
        messages: [{ role: "user", content: input }],
      };

      // Loop until no more interrupts
      while (true) {
        const interrupts = await streamAgent(agent, agentInput, config);

        if (interrupts.length === 0) {
          break; // No more interrupts, we're done
        }

        // Handle all interrupts
        const decisions: any[] = [];
        for (const interrupt of interrupts) {
          decisions.push(await handleInterrupt(interrupt, rl));
        }

        // Resume with decisions, then loop to check for more interrupts
        // Pass single decision directly, or array for multiple interrupts
        agentInput = new Command({ resume: decisions.length === 1 ? decisions[0] : decisions });
      }
    } catch (error) {
      console.error(error);
    }

    rl.resume();
  }
  console.log(chalk.red("👋 Bye..."));
  process.exit(0);
}

// Run the main function
main().catch((err) => console.error(err));