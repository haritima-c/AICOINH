import fs from "fs";

const sessions = [
  "sess_abc",
  "sess_def"
];

async function exportChats() {

  for (const id of sessions) {

    const res = await fetch(
      `https://api.openai.com/v1/chatkit/sessions/${id}/messages`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "chatkit_beta=v1"
        }
      }
    );

    const data = await res.json();

    fs.writeFileSync(
      `logs/${id}.json`,
      JSON.stringify(data, null, 2)
    );

    console.log("Saved", id);
  }
}

exportChats();