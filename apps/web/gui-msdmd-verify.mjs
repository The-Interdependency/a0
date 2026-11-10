#!/usr/bin/env node
// G15 GM08 reproducible integration: verify the owning MSDMD collection.
// Exit 0 only when the served module's schema-2 structure is complete.
import { verifyGuiMsdmd, GUI_MSDMD, MSDMD_SCHEMA } from './gui-msdmd.mjs';

const errors = verifyGuiMsdmd(GUI_MSDMD);
if (errors.length) {
  console.error(`gui-msdmd verification failed (${errors.length}):`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}
console.log(`gui-msdmd verification passed: schema ${MSDMD_SCHEMA}, ${GUI_MSDMD.subjects.length} subjects.`);
