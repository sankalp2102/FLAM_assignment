# Trip Planner

Live: https://trip-planner-phi-azure-67.vercel.app

Describe a trip in plain text and get a day-by-day itinerary you can edit. The
model returns JSON, the app validates it against a schema and renders it as
components. Stops expand, reorder and delete with undo.

Built with React 18, Vite and Zod. The model is `openai/gpt-oss-120b` on Groq,
called through one serverless function so the API key stays on the server.

## Setup

```bash
npm install
cp .env.example .env
npm start
```

Put a Groq key in `.env` before starting:

```
GROQ_API_KEY=your_key_here
GROQ_MODEL=openai/gpt-oss-120b
```

Keys are free at https://console.groq.com/keys

Then open http://localhost:5173

`npm start` is all you need. A small Vite plugin (`dev-api-plugin.js`) runs the
`/api` function inside the dev server, so there is no second process or CLI to
install.

## Usage

Enter your trip description and click on Plan the Trip. Duration, interests, and pace all
matter, such as "5 leisurely days in Lisbon in March, exploring cuisine and azulejos,
not early risers". The blank state has sample prompts in case you need one.

On the result, you can click on a stop to view its description, click on the day header
to collapse it, drag the stop up or down using arrow icons, and delete the stop.

## Tests

```bash
node src/state/reducer.test.js
```

## Files

```
api/itinerary.js     calls the model, parses and validates the response
shared/schema.js     the data contract, used by server and client
src/hooks/           useItinerary: request state and cancellation
src/state/           reducer: itinerary edits, plus its tests
src/components/      UI
```


## AI usage

I have been using Claude for this entire process. The majority of the code has
been written using this as opposed to writing it from scratch, which includes the
serverless handler, the schema, the hook, the reducer, and the components.


## Note on the provider

I started with Gemini. Google's AI Studio now issues `AQ.`-prefixed keys on some
accounts, and those work for listing models but return 404 on `generateContent`.
It is a known issue and not fixable from my side, so I moved to Groq. That took
about half an hour and only changed the HTTP call and the schema format.

## Time spent

About 5-7 hrs to complete this Assignment.