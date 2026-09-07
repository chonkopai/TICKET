import { Controller, Get } from "@nestjs/common";

export interface HealthResponse {
  status: "ok";
}

@Controller()
export class HealthController {
  @Get("health")
  getHealth(): HealthResponse {
    return { status: "ok" };
  }
}
