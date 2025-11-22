import { GoogleGenAI } from "@google/genai";
import { StarType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateStarDescription = async (type: StarType, mass: number): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Gere uma descrição científica curta (máximo 2 parágrafos) e fascinante sobre o nascimento de um novo corpo celeste no simulador.
      
      Detalhes do corpo:
      Tipo: ${type}
      Massa Relativa: ${mass.toFixed(1)} massas solares (aproximado).
      
      Explique brevemente como a rotação da nuvem original influenciou sua formação e a criação do disco de acreção/sistema planetário. Use tom astronômico e educativo em Português.`,
      config: {
        systemInstruction: "Você é um astrofísico narrando a evolução de um universo simulado.",
        temperature: 0.7,
      }
    });

    return response.text || "Dados estelares processados. Sistema estável.";
  } catch (error) {
    console.error("Erro ao gerar descrição estelar:", error);
    return "Uma nova estrela nasceu das cinzas cósmicas. Seus mistérios aguardam exploração.";
  }
};
