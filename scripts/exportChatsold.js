import fs from "fs";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function getMessages(sessionId) {

    const res = await fetch(
        `https://api.openai.com/v1/chatkit/sessions/${sessionId}/messages`,
        {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "OpenAI-Beta": "chatkit_beta=v1"
            }
        }
    );

    return res.json();
}

async function exportChats() {

    const sessions = [
        "cksess_69b0beb6d6888190bdc7c48c2368b91d09e9cd8c48d3334d",
        "scksess_69a08963c26c8190a963ad68e02b129a02ffc1a7c95d566f"
    ];

    for (const sessionId of sessions) {

        const messages = await getMessages(sessionId);

        fs.writeFileSync(
            `logs/${sessionId}.json`,
            JSON.stringify(messages, null, 2)
        );

        console.log("Saved", sessionId);
    }
}

exportChats();