import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** The authenticated user's id, as set on `req.user` by JwtStrategy.validate */
export const CurrentUserId = createParamDecorator(
    (_data: unknown, context: ExecutionContext): string => {
        const request = context
            .switchToHttp()
            .getRequest<Request & { user: { userId: string } }>();
        return request.user.userId;
    },
);
