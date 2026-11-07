import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtConstants } from './constants.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly usersService: UsersService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: jwtConstants.secret,
        });
    }

    /**
     * A token stays valid after its user is deleted (or the database is reset), so the user is
     * looked up on every request. Without this, a write that stores the user id fails on a
     * foreign key with a 500 instead of a 401 that sends the web app back to login.
     */
    async validate(payload: { sub: string; username: string }) {
        const user = await this.usersService.findById(payload.sub);
        if (!user) throw new UnauthorizedException();
        return { userId: user.id, username: user.username };
    }
}
