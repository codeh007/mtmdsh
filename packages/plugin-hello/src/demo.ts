import { Context } from "@deepseek-ai/cordis";
import * as hello from "./index.js";

const ctx = new Context();
const fiber = ctx.plugin(hello);

await fiber.await();
await fiber.dispose();
