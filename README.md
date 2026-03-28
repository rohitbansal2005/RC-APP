# Rocketapp

Rocket.Chat app: **polls**, **grammar fix**, and **room activity** (slash commands).

| Command     | What it does |
|-------------|----------------|
| `/poll`     | `Question? \| A \| B \| …` — buttons, live vote % |
| `/grammar`  | `Your sentence…` — spelling/grammar via [LanguageTool](https://languagetool.org) (light use, no key) |
| `/activity` | Optional `100`–`1000`: scan recent messages, rank top posters in **this room** |

**Example**

```text
/poll Fav game? | snake | ludo
/grammar I has a apple and she go to school
/activity
/activity 800
```

## Setup

- Node.js ≥ 14, running Rocket.Chat, CLI: `npm install -g @rocket.chat/apps-cli`

```bash
npm install
rc-apps package
```

Deploy (pick one):

```bash
rc-apps deploy --update --url http://localhost:3000 --username "<user>" --password "<pass>"
```

```bash
rc-apps deploy --update --url http://localhost:3000 --userId "<id>" --token "<token>"
```

Build output: `dist/rocketapp_0.0.1.zip` (gitignored).

## Demo Videos

### Poll (RC App)


https://github.com/user-attachments/assets/b6a82cb7-8e9b-4bb3-8ac9-70de4fff306f



### GrammerFix (RC App)


https://github.com/user-attachments/assets/5938727b-9cef-4143-8511-b6477eeb818b



### Activity (RC App)


https://github.com/user-attachments/assets/18df0e9a-aa65-48e6-9c66-0bfad5fb1c1c



## Stack

TypeScript, `@rocket.chat/apps-engine`, entry: `RocketappApp.ts`.

MIT License
