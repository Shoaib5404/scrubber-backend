import {
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from './password.service';

export type ProfileResponse = {
  id: number;
  email: string;
  name: string;
  role: string;
  email_verified: boolean;
};

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async getProfile(userId: number): Promise<ProfileResponse> {
    const user = await this.requireUser(userId);
    return this.toProfile(user);
  }

  async updateProfile(userId: number, name: string): Promise<ProfileResponse> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException('Name is required.');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { name: trimmed },
    });
    return this.toProfile(user);
  }

  async updatePassword(
    userId: number,
    input: {
      current_password: string;
      password: string;
      password_confirmation: string;
    },
  ): Promise<{ success: true; message: string }> {
    if (input.password !== input.password_confirmation) {
      throw new UnprocessableEntityException('Password confirmation does not match.');
    }

    const user = await this.requireUser(userId);
    const currentOk = await this.passwords.verifyPassword(
      input.current_password,
      user.password,
    );
    if (!currentOk) {
      // 422 so the SPA does not clear the session on a wrong current password
      throw new UnprocessableEntityException('The provided password was incorrect.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: await this.passwords.hashPassword(input.password) },
    });

    return { success: true, message: 'Password updated.' };
  }

  async deleteAccount(
    userId: number,
    password: string,
  ): Promise<{ success: true; message: string }> {
    const user = await this.requireUser(userId);
    const ok = await this.passwords.verifyPassword(password, user.password);
    if (!ok) {
      throw new UnprocessableEntityException('The provided password was incorrect.');
    }

    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.prisma.user.delete({ where: { id: userId } });

    return { success: true, message: 'Account deleted.' };
  }

  private async requireUser(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Unauthenticated.');
    }
    return user;
  }

  private toProfile(user: {
    id: number;
    email: string;
    name: string;
    role: string;
    emailVerifiedAt: Date | null;
  }): ProfileResponse {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      email_verified: !!user.emailVerifiedAt,
    };
  }
}
