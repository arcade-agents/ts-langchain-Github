---
title: "Build a Github agent with LangChain (TypeScript) and Arcade"
slug: "ts-langchain-Github"
framework: "langchain-ts"
language: "typescript"
toolkits: ["Github"]
tools: []
difficulty: "beginner"
generated_at: "2026-03-12T01:35:13Z"
source_template: "ts_langchain"
agent_repo: ""
tags:
  - "langchain"
  - "typescript"
  - "github"
---

# Build a Github agent with LangChain (TypeScript) and Arcade

In this tutorial you'll build an AI agent using [LangChain](https://js.langchain.com/) with [LangGraph](https://langchain-ai.github.io/langgraphjs/) in TypeScript and [Arcade](https://arcade.dev) that can interact with Github tools — with built-in authorization and human-in-the-loop support.

## Prerequisites

- The [Bun](https://bun.com) runtime
- An [Arcade](https://arcade.dev) account and API key
- An OpenAI API key

## Project Setup

First, create a directory for this project, and install all the required dependencies:

````bash
mkdir github-agent && cd github-agent
bun install @arcadeai/arcadejs @langchain/langgraph @langchain/core langchain chalk
````

## Start the agent script

Create a `main.ts` script, and import all the packages and libraries. Imports from 
the `"./tools"` package may give errors in your IDE now, but don't worry about those
for now, you will write that helper package later.

````typescript
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
````

## Configuration

In `main.ts`, configure your agent's toolkits, system prompt, and model. Notice
how the system prompt tells the agent how to navigate different scenarios and
how to combine tool usage in specific ways. This prompt engineering is important
to build effective agents. In fact, the more agentic your application, the more
relevant the system prompt to truly make the agent useful and effective at
using the tools at its disposal.

````typescript
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
const systemPrompt = "# GitHub Assistant (ReAct) \u2014 Prompt for an AI Agent\n\n## Introduction\nYou are a ReAct-style AI agent that performs GitHub repository, pull request, issue, and project management actions by calling a set of discrete tools (APIs). Your goal is to complete user requests accurately and safely by combining reasoning (Thought), tool calls (Action), observing results (Observation), and producing a final, human-readable response (Answer). Use the available tools to inspect, modify, and manage GitHub entities while minimizing unnecessary or destructive changes.\n\n---\n\n## Instructions\n- Follow the ReAct format in all interactions:\n  - Thought: short internal reasoning about what to do next.\n  - Action: call exactly one tool (name + JSON parameters).\n  - Observation: the tool output (populated by the system).\n  - Repeat Thought/Action/Observation as necessary.\n  - Answer: final message to the user summarizing results, next steps, or questions.\n- Validate critical inputs before taking action:\n  - Always ensure owner, repo, and numeric identifiers (pull/issue numbers) are present and plausible.\n  - If any required parameter is missing or ambiguous, ask a clarifying question instead of assuming.\n- For potentially destructive operations (merge, overwrite files, delete branches, large label changes):\n  - Ask for explicit confirmation from the user unless the user explicitly requested the destructive action in the same turn (e.g., \"Merge PR #42 now\").\n- Fuzzy matches and typo tolerance:\n  - Many tools support fuzzy matching (labels, project items, etc.).\n  - Use auto_accept_matches=True only when you are confident (\u003e 0.9) or the user explicitly authorized fuzzy auto-accept.\n  - If the match confidence is uncertain, call the tool without auto-accept or ask the user to confirm.\n- Minimizing tool calls:\n  - Prefer reading/checking before writing (e.g., check PR mergeability before attempting a merge).\n  - Combine reads where possible to avoid redundant calls.\n- Error handling:\n  - If an Observation indicates an error, interpret the error and either:\n    - Retry with corrected parameters, or\n    - Ask the user for clarification if the error is due to ambiguous input or requires user decision.\n- When leaving the conversation (Answer), explicitly state the next actions the user can ask for and any decisions you need from them.\n\n---\n\n## Agent Output Format (required)\nWhen interacting, use exactly the following format. Do not include extra narrative outside these tags when you plan to call a tool:\n\nThought: \u003cbrief internal thought\u003e\nAction: \u003cToolName\u003e\nAction Input:\n```\n\u003cJSON parameters for the tool\u003e\n```\nObservation: \u003ctool output \u2014 inserted automatically\u003e\n... (repeat Thought/Action/Observation as needed) ...\nAnswer: \u003cfinal user-facing response\u003e\n\nAlways ensure each Action calls one tool and the JSON is valid.\n\n---\n\n## Workflows\nBelow are the common workflows the agent should support. For each workflow, the recommended tool sequence and notes are provided. Use the ReAct format when implementing them.\n\n1) Create a pull request from new branch with file changes\n- Purpose: create a branch, add or change files, and open a PR.\n- Sequence:\n  1. Github_CreateBranch (create branch from default or from_branch specified)\n  2. Github_CreateFile or Github_UpdateFileLines (for each file change on the new branch)\n  3. Github_CreatePullRequest (open PR from branch -\u003e base)\n  4. Optionally Github_ManagePullRequestReviewers (request reviewers) and Github_ManageLabels (add labels)\n- Notes:\n  - Use Github_GetFileContents first if you plan to edit an existing file.\n  - Use Github_CreateFile mode=OVERWRITE only with explicit user consent.\n- Example:\n```\nThought: Create a branch \u0027feature/xyz\u0027 from main and add README changes, then open a PR.\nAction: Github_CreateBranch\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"branch\": \"feature/xyz\",\n  \"from_branch\": \"main\"\n}\nObservation: \u003cbranch created\u003e\nThought: Add README update on the new branch.\nAction: Github_CreateFile\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"path\": \"README.md\",\n  \"content\": \"# Updated README\\nMore details...\\n\",\n  \"message\": \"Update README for feature xyz\",\n  \"branch\": \"feature/xyz\",\n  \"mode\": \"FileMode.CREATE\"\n}\nObservation: \u003cfile created\u003e\nThought: Open a pull request.\nAction: Github_CreatePullRequest\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"title\": \"Add README updates for feature xyz\",\n  \"head\": \"feature/xyz\",\n  \"base\": \"main\",\n  \"body\": \"This PR updates README for feature xyz.\"\n}\nObservation: \u003cPR created\u003e\nAnswer: I created branch feature/xyz, added README.md, and opened PR #123. Would you like me to request reviewers or add labels?\n```\n\n2) Assign a user to a pull request or issue\n- Purpose: assign an assignee with fuzzy matching support.\n- Sequence:\n  1. (Optional) Github_ListRepositoryCollaborators to discover valid assignees if ambiguous.\n  2. Github_AssignPullRequestUser (for PR) or Github_UpdateIssue (for issues \u2014 set assignees)\n- Notes:\n  - Use search_mode to indicate how you interpret the identifier (username, email, name, id).\n  - Set auto_accept_matches=True only with permission.\n- Example:\n```\nThought: Assign @alice to PR #45.\nAction: Github_AssignPullRequestUser\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"pull_request_number\": 45,\n  \"assignee_identifier\": \"alice\",\n  \"search_mode\": \"username\",\n  \"auto_accept_matches\": false\n}\nObservation: \u003cassignment result\u003e\nAnswer: @alice has been assigned to PR #45.\n```\n\n3) Prepare and submit a review on a PR\n- Purpose: leave comments, request changes, or approve.\n- Sequence:\n  1. Github_ListReviewCommentsOnPullRequest or Github_GetPullRequest to inspect files/diff\n  2. Github_CreateReviewComment(s) for file-specific comments (ensure line numbers are within the PR diff)\n  3. Github_SubmitPullRequestReview with event=APPROVE/REQUEST_CHANGES/COMMENT and optional body\n- Notes:\n  - If unsure about line numbers, use subject_type=\u0027file\u0027 to comment on the whole file or fetch diff via include_diff_content=True.\n- Example:\n```\nThought: Add an inline comment and then request changes.\nAction: Github_CreateReviewComment\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"pull_number\": 78,\n  \"path\": \"src/main.py\",\n  \"start_line\": 120,\n  \"end_line\": 120,\n  \"body\": \"This function should have unit tests.\",\n  \"side\": \"RIGHT\"\n}\nObservation: \u003ccomment created\u003e\nThought: Submit formal review requesting changes.\nAction: Github_SubmitPullRequestReview\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"pull_request_number\": 78,\n  \"event\": \"REQUEST_CHANGES\",\n  \"body\": \"Please add unit tests for the new function in src/main.py.\"\n}\nObservation: \u003creview submitted\u003e\nAnswer: I added an inline comment and submitted a review requesting changes on PR #78.\n```\n\n4) Check whether a pull request can be merged, then merge it\n- Purpose: verify mergeability and perform merge safely.\n- Sequence:\n  1. Github_CheckPullRequestMergeStatus (set include_check_details=True when you need CI status)\n  2. If mergeable, get current head SHA (Github_GetPullRequest) or rely on check output\n  3. Github_MergePullRequest with optional sha to ensure head hasn\u0027t changed\n  4. Optionally set delete_branch=True to remove head branch after merge (ask for confirmation)\n- Notes:\n  - Always call check first; if non-mergeable, report why (conflicts, failing checks).\n- Example:\n```\nThought: Check PR #9 mergeability.\nAction: Github_CheckPullRequestMergeStatus\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"pull_request_number\": 9,\n  \"include_check_details\": true\n}\nObservation: \u003cmergeability: mergeable, checks passing, head_sha: abcdef\u003e\nThought: Proceed to merge using current head SHA and delete branch.\nAction: Github_MergePullRequest\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"pull_request_number\": 9,\n  \"merge_method\": \"merge\",\n  \"commit_title\": \"Merge PR #9: Fix issue\",\n  \"commit_message\": \"Merging after CI success\",\n  \"sha\": \"abcdef\",\n  \"delete_branch\": true\n}\nObservation: \u003cmerge successful\u003e\nAnswer: PR #9 merged successfully and head branch deleted.\n```\n\n5) Add or remove labels on an issue or PR\n- Purpose: adjust labels using fuzzy matching if available.\n- Sequence:\n  1. Github_ManageLabels (specify add_labels and/or remove_labels)\n- Notes:\n  - Use auto_accept_matches cautiously; return choices if ambiguous.\n  - Set entity_type to \"issue\" or \"pull_request\".\n- Example:\n```\nThought: Add label \u0027bug\u0027 and remove label \u0027triage\u0027 from issue #12.\nAction: Github_ManageLabels\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"number\": 12,\n  \"entity_type\": \"issue\",\n  \"add_labels\": [\"bug\"],\n  \"remove_labels\": [\"triage\"],\n  \"auto_accept_matches\": false\n}\nObservation: \u003clabels updated\u003e\nAnswer: I added \u0027bug\u0027 and removed \u0027triage\u0027 on issue #12.\n```\n\n6) Create, comment on, or update an issue\n- Purpose: open or update issue content.\n- Sequence (create):\n  1. Github_CreateIssue\n  2. Optionally Github_CreateIssueComment or Github_ManageLabels or Github_UpdateIssue (to set assignees/labels later)\n- Sequence (update):\n  1. Github_UpdateIssue\n- Example:\n```\nThought: Create an issue to track an intermittent test failure.\nAction: Github_CreateIssue\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"title\": \"Intermittent test failure in CI\",\n  \"body\": \"Observed intermittent failure in test suite on master. Steps to reproduce: ...\",\n  \"labels\": [\"ci\", \"flake\"],\n  \"assignees\": [\"ci-maintainer\"]\n}\nObservation: \u003cissue created\u003e\nAnswer: Issue #456 created for the intermittent test failure. Would you like me to add it to a project?\n```\n\n7) Get file content, inspect diffs, or fetch PR details\n- Purpose: read-only lookups before changes.\n- Sequence:\n  - Github_GetFileContents (with ref or start_line/end_line)\n  - Github_GetPullRequest (use include_diff_content=True to fetch diff)\n  - Github_ListPullRequestCommits if commits history needed\n- Notes:\n  - For large files, fetch line ranges.\n- Example:\n```\nThought: Fetch the first 200 lines of src/app.py on main.\nAction: Github_GetFileContents\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"path\": \"src/app.py\",\n  \"ref\": \"main\",\n  \"start_line\": 1,\n  \"end_line\": 200\n}\nObservation: \u003cfile contents returned\u003e\nAnswer: I retrieved lines 1\u2013200 of src/app.py on main. What would you like me to do with this file?\n```\n\n8) List pull requests, issues, or repo collaborators\n- Purpose: overview operations and find entities.\n- Sequence:\n  - Github_ListPullRequests / Github_ListIssues / Github_ListRepositoryCollaborators\n- Notes:\n  - Support pagination and filtering (state, base, labels, sort).\n- Example:\n```\nThought: List open PRs targeting main.\nAction: Github_ListPullRequests\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"state\": \"open\",\n  \"base\": \"main\",\n  \"per_page\": 30\n}\nObservation: \u003clist of PRs\u003e\nAnswer: There are 4 open PRs targeting main. Would you like details for any?\n```\n\n9) Projects (V2) workflows: list projects, fields, items, search items\n- Purpose: interact with Projects V2.\n- Sequence:\n  - Github_ListProjects -\u003e Github_ListProjectFields -\u003e Github_ListProjectItems or Github_SearchProjectItem\n- Notes:\n  - Use auto_accept_matches carefully for project/title fuzzy matching.\n\n10) Stars and stargazers\n- Purpose: read or toggle star status and count/list stargazers.\n- Sequence:\n  - Github_CountStargazers / Github_ListStargazers / Github_SetStarred\n\n11) Notifications \u0026 user activity\n- Purpose: show user\u0027s notifications and recent activity.\n- Sequence:\n  - Github_GetNotificationSummary / Github_ListNotifications / Github_GetUserRecentActivity / Github_GetUserOpenItems\n\n12) Manage reviewers \u0026 review threads\n- Purpose: add or remove reviewers and resolve conversations.\n- Sequence:\n  - Github_ManagePullRequestReviewers -\u003e Github_CreateReplyForReviewComment (reply) -\u003e Github_ResolveReviewThread (resolve/unresolve)\n- Notes:\n  - When replying to a review comment, you can optionally resolve the thread by providing thread_id and resolve_thread=True.\n\n13) Update file ranges (append or replace)\n- Purpose: update specific lines in a file.\n- Sequence:\n  - Github_GetFileContents (to get current line numbers) -\u003e Github_UpdateFileLines\n- Notes:\n  - Provide start_line and end_line for REPLACE mode.\n  - Use mode=FileUpdateMode.APPEND to add to the end.\n- Example:\n```\nThought: Append a note to docs/notes.md on branch feature/xyz.\nAction: Github_UpdateFileLines\nAction Input:\n{\n  \"owner\": \"octo-org\",\n  \"repo\": \"awesome-repo\",\n  \"path\": \"docs/notes.md\",\n  \"branch\": \"feature/xyz\",\n  \"new_content\": \"\\nAdditional note for feature xyz.\\n\",\n  \"message\": \"Append note to docs/notes.md\",\n  \"mode\": \"FileUpdateMode.APPEND\"\n}\nObservation: \u003cfile updated\u003e\nAnswer: Appended the note to docs/notes.md on feature/xyz.\n```\n\n---\n\n## Safety \u0026 Best Practices (quick checklist)\n- Confirm destructive actions with the user.\n- Avoid auto-accept fuzzy matches unless permitted.\n- Prefer reading (GetFileContents, GetPullRequest, CheckPullRequestMergeStatus) before mutating state.\n- When commenting on PR diffs, ensure the line is present in the PR diff; otherwise use subject_type=\u0027file\u0027 or fetch diff first.\n- When merging, include expected head SHA to avoid accidental merges on changed heads.\n- If results are ambiguous, ask the user a clarifying question rather than guessing.\n\n---\n\nIf you understand these instructions, respond in the ReAct format to ask the user for the missing piece of information or to confirm an action when required.";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";
````

Set the following environment variables in a `.env` file:

````bash
ARCADE_API_KEY=your-arcade-api-key
ARCADE_USER_ID=your-arcade-user-id
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5-mini
````

## Implementing the `tools.ts` module

The `tools.ts` module fetches Arcade tool definitions and converts them to LangChain-compatible tools using Arcade's Zod schema conversion:

### Create the file and import the dependencies

Create a `tools.ts` file, and add import the following. These will allow you to build the helper functions needed to convert Arcade tool definitions into a format that LangChain can execute. Here, you also define which tools will require human-in-the-loop confirmation. This is very useful for tools that may have dangerous or undesired side-effects if the LLM hallucinates the values in the parameters. You will implement the helper functions to require human approval in this module.

````typescript
import { Arcade } from "@arcadeai/arcadejs";
import {
  type ToolExecuteFunctionFactoryInput,
  type ZodTool,
  executeZodTool,
  isAuthorizationRequiredError,
  toZod,
} from "@arcadeai/arcadejs/lib/index";
import { type ToolExecuteFunction } from "@arcadeai/arcadejs/lib/zod/types";
import { tool } from "langchain";
import {
  interrupt,
} from "@langchain/langgraph";
import readline from "node:readline/promises";

// This determines which tools require human in the loop approval to run
const TOOLS_WITH_APPROVAL = ['Github_AssignPullRequestUser', 'Github_CreateBranch', 'Github_CreateFile', 'Github_CreateIssue', 'Github_CreateIssueComment', 'Github_CreatePullRequest', 'Github_CreateReplyForReviewComment', 'Github_CreateReviewComment', 'Github_ManageLabels', 'Github_ManagePullRequestReviewers', 'Github_MergePullRequest', 'Github_ResolveReviewThread', 'Github_SetStarred', 'Github_SubmitPullRequestReview', 'Github_UpdateFileLines', 'Github_UpdateIssue', 'Github_UpdatePullRequest'];
````

### Create a confirmation helper for human in the loop

The first helper that you will write is the `confirm` function, which asks a yes or no question to the user, and returns `true` if theuser replied with `"yes"` and `false` otherwise.

````typescript
// Prompt user for yes/no confirmation
export async function confirm(question: string, rl?: readline.Interface): Promise<boolean> {
  let shouldClose = false;
  let interface_ = rl;

  if (!interface_) {
      interface_ = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
      });
      shouldClose = true;
  }

  const answer = await interface_.question(`${question} (y/n): `);

  if (shouldClose) {
      interface_.close();
  }

  return ["y", "yes"].includes(answer.trim().toLowerCase());
}
````

Tools that require authorization trigger a LangGraph interrupt, which pauses execution until the user completes authorization in their browser.

### Create the execution helper

This is a wrapper around the `executeZodTool` function. Before you execute the tool, however, there are two logical checks to be made:

1. First, if the tool the agent wants to invoke is included in the `TOOLS_WITH_APPROVAL` variable, human-in-the-loop is enforced by calling `interrupt` and passing the necessary data to call the `confirm` helper. LangChain will surface that `interrupt` to the agentic loop, and you will be required to "resolve" the interrupt later on. For now, you can assume that the reponse of the `interrupt` will have enough information to decide whether to execute the tool or not, depending on the human's reponse.
2. Second, if the tool was approved by the human, but it doesn't have the authorization of the integration to run, then you need to present an URL to the user so they can authorize the OAuth flow for this operation. For this, an execution is attempted, that may fail to run if the user is not authorized. When it fails, you interrupt the flow and send the authorization request for the harness to handle. If the user authorizes the tool, the harness will reply with an `{authorized: true}` object, and the system will retry the tool call without interrupting the flow.

````typescript
export function executeOrInterruptTool({
  zodToolSchema,
  toolDefinition,
  client,
  userId,
}: ToolExecuteFunctionFactoryInput): ToolExecuteFunction<any> {
  const { name: toolName } = zodToolSchema;

  return async (input: unknown) => {
    try {

      // If the tool is on the list that enforces human in the loop, we interrupt the flow and ask the user to authorize the tool

      if (TOOLS_WITH_APPROVAL.includes(toolName)) {
        const hitl_response = interrupt({
          authorization_required: false,
          hitl_required: true,
          tool_name: toolName,
          input: input,
        });

        if (!hitl_response.authorized) {
          // If the user didn't approve the tool call, we throw an error, which will be handled by LangChain
          throw new Error(
            `Human in the loop required for tool call ${toolName}, but user didn't approve.`
          );
        }
      }

      // Try to execute the tool
      const result = await executeZodTool({
        zodToolSchema,
        toolDefinition,
        client,
        userId,
      })(input);
      return result;
    } catch (error) {
      // If the tool requires authorization, we interrupt the flow and ask the user to authorize the tool
      if (error instanceof Error && isAuthorizationRequiredError(error)) {
        const response = await client.tools.authorize({
          tool_name: toolName,
          user_id: userId,
        });

        // We interrupt the flow here, and pass everything the handler needs to get the user's authorization
        const interrupt_response = interrupt({
          authorization_required: true,
          authorization_response: response,
          tool_name: toolName,
          url: response.url ?? "",
        });

        // If the user authorized the tool, we retry the tool call without interrupting the flow
        if (interrupt_response.authorized) {
          const result = await executeZodTool({
            zodToolSchema,
            toolDefinition,
            client,
            userId,
          })(input);
          return result;
        } else {
          // If the user didn't authorize the tool, we throw an error, which will be handled by LangChain
          throw new Error(
            `Authorization required for tool call ${toolName}, but user didn't authorize.`
          );
        }
      }
      throw error;
    }
  };
}
````

### Create the tool retrieval helper

The last helper function of this module is the `getTools` helper. This function will take the configurations you defined in the `main.ts` file, and retrieve all of the configured tool definitions from Arcade. Those definitions will then be converted to LangGraph `Function` tools, and will be returned in a format that LangChain can present to the LLM so it can use the tools and pass the arguments correctly. You will pass the `executeOrInterruptTool` helper you wrote in the previous section so all the bindings to the human-in-the-loop and auth handling are programmed when LancChain invokes a tool.


````typescript
// Initialize the Arcade client
export const arcade = new Arcade();

export type GetToolsProps = {
  arcade: Arcade;
  toolkits?: string[];
  tools?: string[];
  userId: string;
  limit?: number;
}


export async function getTools({
  arcade,
  toolkits = [],
  tools = [],
  userId,
  limit = 100,
}: GetToolsProps) {

  if (toolkits.length === 0 && tools.length === 0) {
      throw new Error("At least one tool or toolkit must be provided");
  }

  // Todo(Mateo): Add pagination support
  const from_toolkits = await Promise.all(toolkits.map(async (tkitName) => {
      const definitions = await arcade.tools.list({
          toolkit: tkitName,
          limit: limit
      });
      return definitions.items;
  }));

  const from_tools = await Promise.all(tools.map(async (toolName) => {
      return await arcade.tools.get(toolName);
  }));

  const all_tools = [...from_toolkits.flat(), ...from_tools];
  const unique_tools = Array.from(
      new Map(all_tools.map(tool => [tool.qualified_name, tool])).values()
  );

  const arcadeTools = toZod({
    tools: unique_tools,
    client: arcade,
    executeFactory: executeOrInterruptTool,
    userId: userId,
  });

  // Convert Arcade tools to LangGraph tools
  const langchainTools = arcadeTools.map(({ name, description, execute, parameters }) =>
    (tool as Function)(execute, {
      name,
      description,
      schema: parameters,
    })
  );

  return langchainTools;
}
````

## Building the Agent

Back on the `main.ts` file, you can now call the helper functions you wrote to build the agent.

### Retrieve the configured tools

Use the `getTools` helper you wrote to retrieve the tools from Arcade in LangChain format:

````typescript
const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});
````

### Write an interrupt handler

When LangChain is interrupted, it will emit an event in the stream that you will need to handle and resolve based on the user's behavior. For a human-in-the-loop interrupt, you will call the `confirm` helper you wrote earlier, and indicate to the harness whether the human approved the specific tool call or not. For an auth interrupt, you will present the OAuth URL to the user, and wait for them to finishe the OAuth dance before resolving the interrupt with `{authorized: true}` or `{authorized: false}` if an error occurred:

````typescript
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
````

### Create an Agent instance

Here you create the agent using the `createAgent` function. You pass the system prompt, the model, the tools, and the checkpointer. When the agent runs, it will automatically use the helper function you wrote earlier to handle tool calls and authorization requests.

````typescript
const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});
````

### Write the invoke helper

This last helper function handles the streaming of the agent’s response, and captures the interrupts. When the system detects an interrupt, it adds the interrupt to the `interrupts` array, and the flow interrupts. If there are no interrupts, it will just stream the agent’s to your console.

````typescript
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
````

### Write the main function

Finally, write the main function that will call the agent and handle the user input.

Here the `config` object configures the `thread_id`, which tells the agent to store the state of the conversation into that specific thread. Like any typical agent loop, you:

1. Capture the user input
2. Stream the agent's response
3. Handle any authorization interrupts
4. Resume the agent after authorization
5. Handle any errors
6. Exit the loop if the user wants to quit

````typescript
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
````

## Running the Agent

### Run the agent

```bash
bun run main.ts
```

You should see the agent responding to your prompts like any model, as well as handling any tool calls and authorization requests.

## Next Steps

- Clone the [repository](https://github.com/arcade-agents/ts-langchain-Github) and run it
- Add more toolkits to the `toolkits` array to expand capabilities
- Customize the `systemPrompt` to specialize the agent's behavior
- Explore the [Arcade documentation](https://docs.arcade.dev) for available toolkits

