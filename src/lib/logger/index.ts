// import "server-only";

type LogLevel = "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function log(
  level: LogLevel,
  message: string,
  context?: LogContext
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context && { context }),
  };

  const output = JSON.stringify(entry);

  switch (level) {
    case "info":
      console.info(output);
      break;
    case "warn":
      console.warn(output);
      break;
    case "error":
      console.error(output);
      break;
  }
}

export const logger = {
  info: (message: string, context?: LogContext) =>
    log("info", message, context),

  warn: (message: string, context?: LogContext) =>
    log("warn", message, context),

  error: (message: string, context?: LogContext) =>
    log("error", message, context),
};