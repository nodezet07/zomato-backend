import mongoose from "mongoose";
import User from "../src/models/user.model.js";

async function main() {
  await mongoose.connect("mongodb://127.0.0.1:27017/food-app");
  console.log("DB Connected");
  const users = await User.find({});
  console.log(`Found ${users.length} users`);
  for (const u of users) {
    console.log(`User: ${u.fullName} (${u.email})`);
    console.log("Addresses:");
    console.log(JSON.stringify(u.addresses, null, 2));
  }
  await mongoose.disconnect();
}

main().catch(console.error);
