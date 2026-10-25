import { z } from "zod";

export const PinType = z.enum(["Exec", "Bool", "Number", "String", "Array", "Object", "Text", "Button", "List", "Image", "Clip"]);
export type PinType = z.infer<typeof PinType>;

/** "same": types equal. "coerce": implicit conversion codegen must emit. "none": not connectable (use To String / To Number nodes). */
export type PinCompat = "same" | "coerce" | "none";

// Implicit coercions only where nothing is lost; String -> Number/Bool and Number -> Bool need an explicit node.
const COERCIONS = new Set(["Bool>Number", "Bool>String", "Number>String"]);

/** The one rule for connecting an output pin to an input pin (editor validation and codegen both call this). */
export function pinCompat(from: PinType, to: PinType): PinCompat {
  if (from === to) return "same";
  return COERCIONS.has(`${from}>${to}`) ? "coerce" : "none";
}
