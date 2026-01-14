# An agent that uses Github tools provided to perform any task

## Purpose

# Introduction
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

Each workflow is designed to be straightforward and efficient, allowing for rapid execution of tasks while ensuring accuracy and reliability through the use of the specified tools.

## MCP Servers

The agent uses tools from these Arcade MCP Servers:

- Github

## Human-in-the-Loop Confirmation

The following tools require human confirmation before execution:

- `Github_AssignPullRequestUser`
- `Github_CreateBranch`
- `Github_CreateFile`
- `Github_CreateIssue`
- `Github_CreatePullRequest`
- `Github_CreateReviewComment`
- `Github_ManageLabels`
- `Github_ManagePullRequestReviewers`
- `Github_MergePullRequest`
- `Github_ResolveReviewThread`
- `Github_SubmitPullRequestReview`
- `Github_UpdateFileLines`
- `Github_UpdateIssue`
- `Github_UpdatePullRequest`


## Getting Started

1. Install dependencies:
    ```bash
    bun install
    ```

2. Set your environment variables:

    Copy the `.env.example` file to create a new `.env` file, and fill in the environment variables.
    ```bash
    cp .env.example .env
    ```

3. Run the agent:
    ```bash
    bun run main.ts
    ```