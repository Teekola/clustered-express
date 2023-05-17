# Clustered NodeJS Express Server

This application uses NodeJS's built in clustering capabilities.

## Goal
The main goal of this application is to solve the following problem:
- Server is clustered
- Each worker needs data that gets occasionally updated in the database
- How to update the data on the server so that all workers have correct data?

## The solution
- Primary thread forks workers
  ```ts
  if (cluster.isPrimary) {
   // Fork workers from primary cluster
   // maximum of MAX_CLUSTERS and no more than cpu amount
   const nCpus = Math.min(os.cpus().length, MAX_CLUSTERS);
   console.log(`Forking ${nCpus} CPUs`);
   for (let i = 0; i < nCpus; i++) {
      cluster.fork();
   }
   
   // ...
  ```
- Workers create their own express servers that all listen to the same port
- Workers have special route(s) for when the server's data needs to be updated. When this kind of route gets called, the worker sends appropriate message to the primary thread using 
  ```ts 
  // Send data to the primary thread
  cluster.worker.send(message)
  ```
- The primary thread has a listener for messages coming from workers. This listener's handler then sends the updated data to all workers.
  ```ts
   // Listen to messages from workers
   Object.values(cluster.workers).forEach((worker) => {
      worker?.on("message", async (message: MessageToPrimary) => {
         // Logic for handling message
         
         // Update data for all workers
         Object.values(cluster.workers).forEach((worker) =>
            worker?.send(data)
         );
         }
      });
   });
  ```
 - Note! Only serializable data can be sent between primary and worker processes. Therefore for instance Maps and Sets cannot be used.
