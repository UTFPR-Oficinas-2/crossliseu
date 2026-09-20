const secret = process.env.SECRET;

if (!secret) {
    throw new Error('SECRET environment variable is required');
}

export const jwtConstants = { secret };
