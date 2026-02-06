import jwt from 'jsonwebtoken';

interface ZhipuTokenOptions {
    apiKey: string;
    expSeconds?: number;
}

/**
 * 生成智谱 AI 的 JWT Token
 * @param options 配置项
 * @returns Token 字符串
 */
export function generateZhipuToken({ apiKey, expSeconds = 3600 }: ZhipuTokenOptions): string {
    const [id, secret] = apiKey.split('.');

    if (!id || !secret) {
        throw new Error('Invalid Zhipu API Key format');
    }

    const payload = {
        api_key: id,
        exp: Date.now() + expSeconds * 1000,
        timestamp: Date.now(),
    };

    // @ts-ignore - jsonwebtoken types might complain about algorithm but HS256 is correct
    return jwt.sign(payload, secret, {
        algorithm: 'HS256',
        header: {
            alg: 'HS256',
            sign_type: 'SIGN',
        },
    });
}
