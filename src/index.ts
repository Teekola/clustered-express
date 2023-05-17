import express from "express";
import cors from "cors";
import cluster from "cluster";
import os from "os";

type MessageToWorker = {
   action: "updatePaymentOptions";
   data: PaymentOptions;
   companyId: string;
};
type MessageToPrimary = {
   action: "updatePaymentOptions";
   companyId: string;
};

type PaymentOptions = {
   [companyId: string]: {
      paytrailSecret: string;
      epassiSecret: string;
      smartumVenueId: string;
   };
};

type Data = { paymentOptions: PaymentOptions | null };

// This is data storage for a single worker
const data: Data = {
   paymentOptions: null,
};

// PrismaClients can be then stored separately for each cluster
// Inactive prisma clients should be disconnected.
type PrismaClient = {}; // MockType
const maps = {
   prismaClients: new Map<string, PrismaClient>(),
};

const MAX_CLUSTERS = 4;

async function mockGetPaymentOptionsFromDb(companyId: string) {
   await new Promise((resolve) => {
      setTimeout(() => {
         resolve(null);
      }, 2000);
   });

   const object: PaymentOptions = {
      abc123: {
         paytrailSecret: "saippuakauppias",
         epassiSecret: "isoepassisalaisuus",
         smartumVenueId: "ven_123jeejee",
      },
      cde224: {
         paytrailSecret: "12",
         epassiSecret: "3",
         smartumVenueId: "55",
      },
   };

   object[companyId] = {
      paytrailSecret: Math.random().toString(36),
      epassiSecret: "3",
      smartumVenueId: "55",
   };

   return object;
}

async function updatePaymentOptions(companyId: string) {
   // Get all workers
   const workers = cluster.workers;
   if (!workers) {
      console.log("no workers to update");
      return;
   }

   const paymentOptions = await mockGetPaymentOptionsFromDb(companyId);

   // Update data for all workers
   Object.values(workers).forEach((worker) =>
      worker?.send({ action: "updatePaymentOptions", data: paymentOptions, companyId })
   );
}

// Primary cluster
if (cluster.isPrimary) {
   // Fork workers from primary cluster
   // maximum of MAX_CLUSTERS and no more than cpu amount
   const nCpus = Math.min(os.cpus().length, MAX_CLUSTERS);
   console.log(`Forking ${nCpus} CPUs`);
   for (let i = 0; i < nCpus; i++) {
      cluster.fork();
   }

   if (!cluster.workers) throw new Error("There are no workers!");

   // Listen for messages from workers.
   // Workers deliver messages to the primary with process.send(<message>)
   Object.values(cluster.workers).forEach((worker) => {
      worker?.on("message", async (message: MessageToPrimary) => {
         // Update the paymentOptions if received message indicates to do so
         if (message.action === "updatePaymentOptions") {
            await updatePaymentOptions(message.companyId);
         }
      });
   });
}

// Workers
if (cluster.isWorker) {
   // Create app router
   const port = 8000;
   const app = express();

   // Middleware
   app.use(cors());
   app.use(express.json());

   // Routes
   app.get("/updatePaymentOptions/:companyId", async (req, res) => {
      if (!cluster.worker) {
         return res.status(404).send("No worker!");
      }

      // Tell primary to update all workers
      cluster.worker.send({
         action: "updatePaymentOptions",
         companyId: req.params.companyId,
      });
      return res.status(200).send(`Told primary to update @${new Date().toISOString()}`);
   });
   app.get("/", (req, res) => {
      return res.json({
         data,
      });
   });
   app.listen(port, () => {
      console.log(`⚡️ Server is running on http://localhost:${port}`);
   });

   // Listen to messages from primary worker
   process.on("message", (message: MessageToWorker) => {
      // Update data of current worker
      data.paymentOptions = message.data;
      console.log("updated paymentOptions for", process.pid);
   });
}
