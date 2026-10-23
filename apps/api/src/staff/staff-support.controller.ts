import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  StaffGatewayGuard,
  StaffRoles,
  StaffSessionGuard,
  type StaffRequest,
} from "./staff.guards.js";
import {
  PlatformSupportService,
  type UploadFile,
  validId,
} from "./platform-support.service.js";
import { download } from "./platform-support.controller.js";
@Controller("staff")
@UseGuards(StaffGatewayGuard, StaffSessionGuard)
export class StaffSupportController {
  constructor(
    @Inject(PlatformSupportService) private service: PlatformSupportService,
  ) {}
  @Get("cases") cases(
    @Req() req: StaffRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.cases(req.staff, query);
  }
  @Get("cases/:id/messages") messages(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.messages(id, req.staff, query);
  }
  @Post("cases/:id/messages") message(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.message(id, req.staff, body);
  }
  @Patch("cases/:id") update(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(id, req.staff, body);
  }
  @Get("cases/:id/order-chat") chat(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.service.orderChat(id, req.staff, query);
  }
  @Post("cases/:id/uploads")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @UploadedFile() file: UploadFile | undefined,
  ) {
    return this.service.upload(req.staff, file, id);
  }
  @Get("files/:id") async file(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Res() res: Parameters<typeof download>[0],
  ) {
    download(res, await this.service.file(id, req.staff));
  }
  @Get("verifications") @StaffRoles("moderator") async verifications(
    @Query("organizerId") organizerId?: string,
  ) {
    if (organizerId) return this.service.verification(validId(organizerId));
    return this.service.db.organizerVerification.findMany({
      where: { status: "pending" },
      select: {
        id: true,
        organizerId: true,
        legalName: true,
        createdAt: true,
        status: true,
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
  }
  @Post("verifications/:id/review") @StaffRoles("moderator") review(
    @Req() req: StaffRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.review(id, req.staff, body);
  }
}
