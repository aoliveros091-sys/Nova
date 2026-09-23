# Nova

Nova's existing site plus an AI sidebar shortcut, OpenRouter chat, saved conversations, and automatic memory. The robot icon is a vector recreation of the supplied reference. Chat includes a centered message column, searchable/collapsible conversation sidebar, mobile drawer, safe Markdown formatting, copy controls, and an expanding composer.

## Run locally

Requires Node.js 22 or newer. No dependencies are required.

1. Copy `.env.example` to `.env`.
2. Put your key after `OPENROUTER_API_KEY=` in `.env`.
3. In PowerShell, run `$env:PORT = '6767'`, then `npm start`.
4. Open http://localhost:6767. Restart the server after changing `.env`.

Never put the key in `Index.html`, `assets/ai.js`, chat messages, or a GitHub commit. `.env` and Cloudflare's `.dev.vars` are ignored by Git. The build copies only public HTML/CSS/JS into `dist`.

## Free hosting: Cloudflare Pages (recommended)

1. In Cloudflare **Workers & Pages**, create a **Pages** project and connect this GitHub repository. You may need the repository owner to approve the GitHub integration.
2. Choose the branch containing these changes (`dubcatalt2-lab/first-edit`), framework **None**, build command `npm run build`, output directory `dist`.
3. In the Pages project's **Settings → Variables and Secrets → Add**, create `OPENROUTER_API_KEY` with your key and select **Encrypt**.
4. Optionally set `OPENROUTER_MODEL` (default: `openrouter/free`) and `AI_ACCESS_CODE` (a separate shared password).
5. Create a D1 database named `nova-usage` in Cloudflare. In the Pages project's **Settings → Bindings → Add → D1 database**, enter variable name **`NOVA_DB`** and select that database. Nova creates its usage table automatically. Set the binding for Production (and separately for Preview if needed).
6. Set variables for the deployment environment you use, then deploy/redeploy. In **Deployments**, use the latest deployment's **… → Retry deployment** after changing bindings. AI requests pause if `NOVA_DB` is missing; static pages still work.

The root `functions/api/chat.js` handles `/api/chat`. Use Git integration or Wrangler deployment: uploading only `dist` through a static drag-and-drop flow does not deploy this function. The build converts `Index.html` to lowercase `dist/index.html` so the homepage works on Linux hosts.

Cloudflare Pages static requests are free; Pages Functions use the Workers Free allowance (currently 100,000 requests/day, shared with other Workers). This is not unlimited AI usage.

Sources: [Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/), [secret settings](https://developers.cloudflare.com/pages/functions/bindings/#secrets).

## Alternative: Netlify Free

The current token allowance requires Cloudflare D1. The retained Netlify adapters need a compatible persistent database adapter before AI can run there; environment variables alone are no longer sufficient. They fail closed rather than bypass the allowance. Use Cloudflare Pages for this version.

1. Import the GitHub repository and choose the branch with these changes.
2. Netlify reads `netlify.toml`: build `npm run build`, publish `dist`, functions `netlify/functions`.
3. Under **Project configuration → Environment variables**, add `OPENROUTER_API_KEY` as a secret. Make it available to **Functions** (or all scopes if individual scopes are not offered).
4. Optionally add `OPENROUTER_MODEL` and `AI_ACCESS_CODE`, then redeploy.

Netlify's free plan uses monthly credits and pauses projects when those credits are exhausted. Check its current allowance before publishing.

Sources: [Netlify pricing](https://www.netlify.com/pricing/), [function environment variables](https://docs.netlify.com/build/functions/environment-variables/).

## Chat history and memory

- Conversations automatically save to this browser's localStorage, including before sending a request. Reopen chats, rename/delete them, or export all chats and memory as JSON.
- Full history stays locally. Each request includes at most the last 30 messages and 48,000 characters of recent context; older messages remain visible but are outside the AI context.
- Memory updates automatically in the background after successful replies through `/api/memory`. The model extracts durable preferences and ongoing interests from the newest user message and merges them with existing memory. Each update is an additional OpenRouter request. Memory quality depends on the model; invalid updates leave the previous memory intact. The model is instructed not to retain secrets or sensitive personal details.
- Open the small **Memory on** button to review saved details or toggle memory off. **Forget everything** clears memory and pauses automatic memory so pending requests cannot restore it. Turn it on again to resume. Deleting chats does not erase memory, and clearing memory does not erase chat messages. Memory is learned from new messages, not re-extracted from deleted/older conversations.
- Only message context and enabled saved memory are sent through OpenRouter to the model provider. Histories do not sync across devices, browsers, or domains. Clearing browser data removes them. Export beforehand if you need a backup; export is download-only, with no import UI yet.
- Stop cancels waiting in the browser; the provider may already be processing the request. Failed/stopped requests can be retried without duplicating the user message.
- When the owner enables `AI_ACCESS_CODE`, a small dialog asks for that shared password on the first request. This is never an OpenRouter key. It is not persisted or exported. Without `AI_ACCESS_CODE`, anyone who reaches the site can use its AI endpoints. Use a separate access code for private use and set a spending limit on your OpenRouter key if selecting paid models. A shared code is not per-user authentication or rate limiting.

## Model picker and Cloudflare setup

The composer model picker saves a selection per conversation. The site default remains `OPENROUTER_MODEL` (or `openrouter/free` when unset). Existing chats still work. Switching models keeps the chat history.

The list includes `deepseek/deepseek-v4.1-flash`, `openai/gpt-6-luna`, and the current OpenRouter catalog's free text-chat models. It filters out audio/image-only output, batch IDs, unknown token prices, and per-request charges. Models are listed based on catalog metadata, not an account-specific live inference test; provider availability, account restrictions, and rate limits still apply. No silent switch to a paid model occurs on failure. The list refreshes every five minutes while chat is open, or with the refresh button beside the picker.

In **Cloudflare Pages → your project → Settings → Variables and Secrets**, select **Production** and use:

| Name | Type | Value |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Secret / Encrypt | Your OpenRouter API key |
| `OPENROUTER_MODEL` | Text | `deepseek/deepseek-v4.1-flash` (or `openai/gpt-6-luna`) as the site default |
| `OPENROUTER_MEMORY_MODEL` | Text, optional | A fixed memory model, e.g. `openrouter/free`; otherwise memory uses the conversation model |
| `AI_ACCESS_CODE` | Secret, optional | A separate shared password for access to your site's AI |

Save and redeploy after changing these settings. Set Preview values separately if testing a preview deployment. Use a single model ID in `OPENROUTER_MODEL`, not a comma-separated list. The picker automatically supplies the other choices. One OpenRouter key covers all these models; paid choices use that key's credits, and automatic memory makes a separate request.

Default free router: [OpenRouter free models](https://openrouter.ai/openrouter/free). Free models still have availability and rate limits. Hosting and OpenRouter are separate services.

## Checks

`npm test` runs API validation, access, memory, and provider-error tests with mocked responses. `npm run build` creates the publish directory. Live replies require your own configured key.

## Browser allowance

- Each browser profile gets 10,000 tokens per 96-hour window, shared across models, chats, replies, and automatic memory. This is not 10,000 each day. The composer shows remaining tokens and the reset date. Context resent on later messages also counts.
- An opaque HttpOnly cookie identifies the browser. Usage is stored server-side in `NOVA_DB`, not editable localStorage. Clearing cookies, changing browsers, or private browsing creates a new allowance; this is not account authentication or a tamper-proof per-person limit.
- Requests atomically reserve a conservative input estimate plus bounded output before contacting OpenRouter. Reported total token usage reconciles the reservation afterward. Different model accounting can make a final response exceed the estimate; subsequent requests are blocked once the allowance is exhausted. This is not a guaranteed exact billing cap. Unknown usage after a timeout retains the reservation until reset. Rejected provider requests release it.
- Local development uses persistent SQLite in ignored `.nova-data/usage.sqlite`; restarting the server does not reset usage. Production requires the D1 binding above. See [Cloudflare D1 bindings](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases).

## Images and screen sharing

- Attach or paste one JPG, PNG, or WebP image (up to 10 MB). Nova resizes it to at most 1024 pixels per edge and converts it to JPEG before sending. Select a model marked **Vision**; text-only models reject attachments without discarding them.
- **Screen** opens the browser's screen/window/tab picker and a local preview. Each message captures and sends the current frame, with no audio or continuous AI video stream. Stop sharing with either Nova's button or the browser's control. Leaving AI or switching chats also stops capture. Screen capture requires a supported desktop browser and HTTPS (localhost works for development).
- Images are stored in this browser's IndexedDB and included in JSON exports. Deleting a chat removes its images. Clearing browser data removes images and history; nothing syncs between devices.
- Only the latest message's image is sent to the provider; old thumbnails remain in history. Reattach an older image if the AI needs to examine it again. Automatic memory receives text only. Images and screen frames consume tokens too.
