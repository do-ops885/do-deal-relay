import fs from "fs";
import { load as yamlLoad, JSON_SCHEMA } from "js-yaml";

// Accept an optional file path as CLI argument, default to .github/dependabot.yml
const DEPENDABOT_PATH = process.argv[2] || ".github/dependabot.yml";

try {
  if (!fs.existsSync(DEPENDABOT_PATH)) {
    console.error(`Error: ${DEPENDABOT_PATH} not found`);
    process.exit(1);
  }

  const content = fs.readFileSync(DEPENDABOT_PATH, "utf8");
  const config = yamlLoad(content, { schema: JSON_SCHEMA });

  if (!config || config.version !== 2) {
    console.error("Error: dependabot.yml must have version: 2");
    process.exit(1);
  }

  if (!Array.isArray(config.updates)) {
    console.error('Error: dependabot.yml must have an "updates" list');
    process.exit(1);
  }

  const validEcosystems = [
    "npm",
    "github-actions",
    "docker",
    "terraform",
    "docker-compose",
    "pre-commit",
    "bundler",
    "cargo",
    "composer",
    "hex",
    "git-submodule",
    "gomod",
    "gradle",
    "maven",
    "nuget",
    "pip",
    "pub",
    "swift",
  ];

  const validIntervals = ["daily", "weekly", "monthly"];
  const validDays = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  config.updates.forEach((update, index) => {
    const eco = update["package-ecosystem"];
    const prefix = `Update[${index}] (${eco || "unknown"}):`;

    if (!eco || !validEcosystems.includes(eco)) {
      console.error(`${prefix} Missing or invalid package-ecosystem`);
      process.exit(1);
    }

    if (typeof update.directory !== "string") {
      console.error(`${prefix} Missing or invalid directory`);
      process.exit(1);
    }

    if (
      !update.schedule ||
      !validIntervals.includes(update.schedule.interval)
    ) {
      console.error(`${prefix} Missing or invalid schedule.interval`);
      process.exit(1);
    }

    if (
      update.schedule.day &&
      !validDays.includes(update.schedule.day.toLowerCase())
    ) {
      console.error(`${prefix} Invalid schedule.day: ${update.schedule.day}`);
      process.exit(1);
    }

    if (update.groups) {
      Object.entries(update.groups).forEach(([groupName, groupConfig]) => {
        if (!Array.isArray(groupConfig.patterns)) {
          console.error(
            `${prefix} Group "${groupName}" must have a patterns list`,
          );
          process.exit(1);
        }
      });
    }

    if (update.ignore) {
      if (!Array.isArray(update.ignore)) {
        console.error(`${prefix} "ignore" must be a list`);
        process.exit(1);
      }
      update.ignore.forEach((ignoreEntry, i) => {
        if (!ignoreEntry["dependency-name"]) {
          console.error(
            `${prefix} Ignore entry ${i} must have dependency-name`,
          );
          process.exit(1);
        }
      });
    }
  });

  console.log(`✓ ${DEPENDABOT_PATH} is valid`);
} catch (e) {
  console.error("Error parsing", DEPENDABOT_PATH, ":", e.message);
  process.exit(1);
}
