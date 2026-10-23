import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Inject,
  Injectable,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthService } from "../auth/auth.service.js";
import { AnonymousService } from "../orders/anonymous.service.js";
import {
  PlatformSupportService,
  type Participant,
  type UploadFile,
} from "./platform-support.service.js";
interface PublicRequest {
  headers: Record<string, string | undefined>;
  participant: Participant;
}
interface DownloadResponse {
  setHeader(name: string, value: string): void;
  send(value: Buffer): void;
}
@Injectable()
export class SupportParticipantGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private auth: AuthService,
    @Inject(AnonymousService) private quick: AnonymousService,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<PublicRequest>();
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? "")?.[1];
    if (req.headers["x-quick-access"]) {
      const session = await this.quick.access(req.headers["x-quick-access"]);
      if (!session.orderId) throw new ForbiddenException();
      req.participant = {
        anonymousSessionId: session.id,
        orderId: session.orderId,
      };
    } else if (token) {
      const user = await this.auth.authenticate(token);
      req.participant = { userId: user.userId, role: user.role };
    } else throw new ForbiddenException({ code: "SUPPORT_SIGN_IN_REQUIRED" });
    ctx
      .switchToHttp()
      .getResponse<DownloadResponse>()
      .setHeader("Cache-Control", "private, no-store");
    return true;
  }
}
export function download(
  res: DownloadResponse,
  file: { name: string; mime: string; buffer: Buffer },
) {
  res.setHeader("Content-Type", file.mime);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  res.send(file.buffer);
}
@Controller("platform-support")
@UseGuards(SupportParticipantGuard)
export class PlatformSupportController {
  constructor(
    @Inject(PlatformSupportService) private service: PlatformSupportService,
  ) {}
  @Get("cases") cases(
    @Req() req: PublicRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.cases(req.participant, query);
  }
  @Post("cases") create(@Req() req: PublicRequest, @Body() body: unknown) {
    return this.service.create(req.participant, body);
  }
  @Get("cases/:id/messages") messages(
    @Req() req: PublicRequest,
    @Param("id") id: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.messages(id, req.participant, query);
  }
  @Post("cases/:id/messages") message(
    @Req() req: PublicRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.message(id, req.participant, body);
  }
  @Post("uploads")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Req() req: PublicRequest,
    @UploadedFile() file: UploadFile | undefined,
    @Query("caseId") caseId?: string,
  ) {
    return this.service.upload(req.participant, file, caseId);
  }
  @Get("files/:id") async file(
    @Req() req: PublicRequest,
    @Param("id") id: string,
    @Res() res: DownloadResponse,
  ) {
    download(res, await this.service.file(id, req.participant));
  }
  @Get("verification") verification(@Req() req: PublicRequest) {
    if (!req.participant.userId) throw new ForbiddenException();
    return this.service.verification(req.participant.userId);
  }
  @Post("verification") submit(
    @Req() req: PublicRequest,
    @Body() body: unknown,
  ) {
    if (!req.participant.userId) throw new ForbiddenException();
    return this.service.submit(req.participant.userId, body);
  }
}
