import handler from "vinext/server/fetch-handler";
import { withRequestDatabaseUrl } from "../lib/runtime-env";

type WorkerEnvironment = {
  HYPERDRIVE?: { connectionString?: string };
  CYBERDEV_DATABASE_URL?: string;
  DATABASE_URL?: string;
};

type VinextHandler = {
  fetch: (
    request: Request,
    environment: WorkerEnvironment,
    executionContext: unknown
  ) => Response | Promise<Response>;
};

const vinextHandler = handler as unknown as VinextHandler;

const worker = {
  fetch(request: Request, environment: WorkerEnvironment, executionContext: unknown) {
    const connectionString = environment.HYPERDRIVE?.connectionString
      || environment.CYBERDEV_DATABASE_URL
      || environment.DATABASE_URL;
    return withRequestDatabaseUrl(connectionString, () =>
      Promise.resolve(vinextHandler.fetch(request, environment, executionContext))
    );
  },
};

export default worker;
