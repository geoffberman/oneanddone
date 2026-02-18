import bcrypt from "bcryptjs";
import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const emails = process.argv.slice(2, -1);
const newPassword = process.argv[process.argv.length - 1];

if (emails.length === 0 || !newPassword) {
  console.error(
    "Usage: npx tsx scripts/reset-password.ts <email1> [email2 ...] <new-password>"
  );
  process.exit(1);
}

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const hashed = await bcrypt.hash(newPassword, 12);

  for (const email of emails) {
    const rows =
      await sql`UPDATE users SET password = ${hashed} WHERE LOWER(email) = LOWER(${email}) RETURNING email`;
    if (rows.length > 0) {
      console.log(`Updated password for: ${rows[0].email}`);
    } else {
      console.log(`No user found with email: ${email}`);
    }
  }
}

main().catch(console.error);
