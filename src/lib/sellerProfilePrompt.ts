import { createContext, useContext } from "react";

export const SellerProfilePromptContext = createContext<(() => void) | null>(null);

export function useSellerProfilePrompt() {
  const prompt = useContext(SellerProfilePromptContext);
  if (!prompt) throw new Error("Seller profile prompt is unavailable.");
  return prompt;
}
