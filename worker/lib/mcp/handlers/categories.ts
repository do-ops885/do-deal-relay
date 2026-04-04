import { z } from "zod";
import { CATEGORY_DEFINITIONS } from "../../categorization/definitions";
import type { ToolCallResult } from "../types";

export const ListCategoriesInputSchema = z.object({
  include_descriptions: z
    .boolean()
    .default(false)
    .describe("Include category descriptions"),
});

/**
 * List categories tool handler
 */
export async function handleListCategories(
  args: z.infer<typeof ListCategoriesInputSchema>,
): Promise<ToolCallResult> {
  const { include_descriptions } = args;

  const categories = Object.entries(CATEGORY_DEFINITIONS).map(
    ([name, def]) => ({
      name,
      description: def.description,
      keywords: include_descriptions ? def.keywords.slice(0, 10) : undefined,
    }),
  );

  return {
    content: [
      {
        type: "text",
        text: `📂 Available categories: ${categories.map((c) => c.name).join(", ")}`,
      },
      {
        type: "resource",
        resource: {
          uri: "categories://list",
          mimeType: "application/json",
          text: JSON.stringify({ categories }, null, 2),
        },
      },
    ],
    structuredContent: { categories },
  };
}
