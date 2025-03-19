import { exec, execSync } from "child_process";
import { S3Client, S3ClientConfig } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream, unlink, statSync, rm } from "fs";
import { filesize } from "filesize";
import path from "path";
import os from "os";

import { env } from "./env";

const uploadToS3 = async ({ name, path }: { name: string; path: string }) => {
  console.log("Uploading backup to S3...");

  const bucket = env.AWS_S3_BUCKET;

  const clientOptions: S3ClientConfig = {
    region: env.AWS_S3_REGION,
  };

  if (env.AWS_S3_ENDPOINT) {
    console.log(`Using custom endpoint: ${env.AWS_S3_ENDPOINT}`);
    clientOptions["endpoint"] = env.AWS_S3_ENDPOINT;
  }

  const client = new S3Client(clientOptions);

  await new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: name,
      Body: createReadStream(path),
    },
  }).done();

  console.log("Backup uploaded to S3...");
};

const getDumpDir = (filePath: string) => {
  return `${filePath}_dir`;
}

const dumpToFile = async (filePath: string) => {
  console.log("Dumping DB to file...");

  const dumpDir = getDumpDir(filePath);

  await new Promise((resolve, reject) => {
    // Parallel dump to directory format with no compression
    exec(`pg_dump -v -Fd -j 8 -Z0 --dbname=${env.BACKUP_DATABASE_URL} -f ${dumpDir}`, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr: stderr.trimEnd() });
        return;
      }

      if (stderr) {
        console.log({ stderr: stderr.trimEnd() });
        console.log(
          `Potential warnings detected; Please ensure the backup directory "${dumpDir}" contains all needed data`
        );
      }

      try {
        console.log("Starting archiving");
        console.time("archiving");
        // Archive directory as .tar.gz
        
        execSync(`tar -cf - -C ${dumpDir} . | zstd -T${numCores} -o ${filePath}`);
        console.timeEnd("archiving");
        // Validate archive
        const isValidArchive = execSync(`gzip -cd ${filePath} | head -c1`).length === 1;
        if (!isValidArchive) {
          reject({ error: "Backup archive file is invalid or empty; check for errors above" });
          return;
        }

        console.log("Backup archive file is valid");
        console.log("Backup filesize:", filesize(statSync(filePath).size));

        resolve(undefined);
      } catch (archiveError) {
        reject({ error: archiveError });
      }
    });
  });

  console.log("DB dumped to file...");
};

const deleteFile = async (filePath: string) => {
  console.log("Deleting backup files...");

  const dumpDir = getDumpDir(filePath);

  // Delete the .tar.gz archive
  await new Promise((resolve, reject) => {
    unlink(filePath, (err) => {
      if (err) {
        reject({ error: err });
        return;
      }
      resolve(undefined);
    });
  });

  // Delete the dump directory recursively
  await new Promise((resolve, reject) => {
    rm(dumpDir, { recursive: true, force: true }, (err) => {
      if (err) {
        reject({ error: err });
        return;
      }
      resolve(undefined);
    });
  });

  console.log("Backup files deleted.");
};

export const backup = async () => {
  console.log("Initiating DB backup...");

  const date = new Date().toISOString();
  const timestamp = date.replace(/[:.]+/g, "-");
  const filename = `backup-${timestamp}.tar.gz`;
  const filepath = path.join(os.tmpdir(), filename);

  await dumpToFile(filepath);
  await uploadToS3({ name: filename, path: filepath });
  await deleteFile(filepath);

  console.log("DB backup complete...");
};
