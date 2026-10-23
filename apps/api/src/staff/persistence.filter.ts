import { ArgumentsHost, Catch, type ExceptionFilter } from "@nestjs/common";
import { Prisma } from "@event-platform/database";
/** Return stable errors without exposing Prisma arguments or private document/contact data. */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientUnknownRequestError,
)
export class PersistenceExceptionFilter implements ExceptionFilter {
  catch(error: Error, host: ArgumentsHost) {
    const code = "code" in error ? String(error.code) : "",
      details = error.message;
    let status = 500,
      result = "PERSISTENCE_UNAVAILABLE";
    if (code === "P2025") {
      status = 404;
      result = "RECORD_NOT_FOUND";
    } else if (code === "P2002") {
      status = 409;
      result = "RECORD_ALREADY_EXISTS";
    } else if (code === "P2003") {
      status = 409;
      result = "RECORD_HAS_DEPENDENCIES";
    } else if (details.includes("ACCOUNT_RESTRICTED")) {
      status = 403;
      result = "ACCOUNT_RESTRICTED";
    } else if (details.includes("EVENT_SALES_PAUSED")) {
      status = 409;
      result = "EVENT_SALES_PAUSED";
    }
    host
      .switchToHttp()
      .getResponse<{ status(v: number): { json(body: object): void } }>()
      .status(status)
      .json({ code: result });
  }
}
