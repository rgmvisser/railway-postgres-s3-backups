import { CronJob } from "cron";
import { backup } from "./backup";
import { env } from "./env";
import { exit } from "process";

console.log("NodeJS Version: " + process.version);

const tryBackup = async () => {
  try {
    await backup();
  } catch (error) {
    console.error("Error while running backup: ", error);
    exit(1);
  }
};

const job = new CronJob(env.BACKUP_CRON_SCHEDULE, async () => {
  await tryBackup();
});

if (env.RUN_ON_STARTUP) {
  console.log("Running on start backup...");

  tryBackup();
}

job.start();

console.log("Backup cron scheduled...");
