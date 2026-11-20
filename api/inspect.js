import { execSync } from "child_process";
import fs from "fs";

export default function handler(req, res) {
  const result = {
    cwd: process.cwd(),
    files_in_cwd: fs.readdirSync(process.cwd()),
    files_in_api: fs.existsSync("api") ? fs.readdirSync("api") : [],
    files_in_app: fs.existsSync("app") ? fs.readdirSync("app") : [],
    node_version: process.version,
    env_keys: Object.keys(process.env).sort(),
  };

  try {
    result.python3 = execSync("python3 --version", { encoding: "utf8" }).trim();
  } catch (e) {
    result.python3_err = e.message;
  }

  try {
    result.python = execSync("python --version", { encoding: "utf8" }).trim();
  } catch (e) {
    result.python_err = e.message;
  }

  try {
    result.pip = execSync("python3 -m pip list", { encoding: "utf8" }).trim();
  } catch (e) {
    result.pip_err = e.message;
  }

  res.status(200).json(result);
}

