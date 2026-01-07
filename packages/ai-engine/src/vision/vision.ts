import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function visionAgent(imageBase64: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a food label reading assistant. Extract ingredients clearly.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Read the ingredients from this product label.",
          },
          {
            type: "input_image",
            image_base64: imageBase64,
          },
        ],
      },
    ],
  });

  const text = response.choices[0].message.content || "";

  return {
    rawText: text,
    ingredients: extractIngredients(text),
    confidence: 0.85,
  };
}

function extractIngredients(text: string): string[] {
  return text
    .split(/,|\n/)
    .map((i) => i.trim().toLowerCase())
    .filter(Boolean);
}
