import { config } from 'dotenv';
import OpenAI from 'openai';

config(); // Carga tu API key desde .env

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const prompt = process.argv.slice(2).join(' ');

async function run() {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });

    console.log('\n💡 Respuesta:');
    console.log(completion.choices[0].message.content);
  } catch (error) {
    console.error('❌ Error al usar la API:', error.message);
  }
}

run();
