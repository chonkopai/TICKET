import type { Prisma,User } from "@event-platform/database";
import { ConflictException,UnauthorizedException } from "@nestjs/common";
/** The account action and atomic publisher use the same enrollment policy. */
export async function ensureOrganizer(transaction:Pick<Prisma.TransactionClient,"user">,userId:string,requiresApproval:boolean):Promise<User>{
 const current=await transaction.user.findUnique({where:{id:userId}});if(!current)throw new UnauthorizedException({code:"SESSION_REQUIRED"});
 if(current.role==="organizer"||current.role==="admin")return current;
 if(requiresApproval)throw new ConflictException({code:"ORGANIZER_APPROVAL_REQUIRED",message:"Organizer approval is required by the current policy"});
 return transaction.user.update({where:{id:userId},data:{role:"organizer"}});
}
