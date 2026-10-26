import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return await this.userRepository.save(user);
  }

  async findByEmail(email: string, includePassword = false): Promise<User | null> {
    if (includePassword) {
      return await this.userRepository
        .createQueryBuilder('user')
        .addSelect('user.password')
        .where('user.email = :email', { email })
        .getOne();
    }
    return await this.userRepository.findOne({ where: { email } });
  }

  async findByEmailWithAuthDetails(email: string): Promise<User | null> {
    return await this.userRepository
      .createQueryBuilder('user')
      .addSelect([
        'user.password',
        'user.verificationCode',
        'user.codeExpiresAt',
        'user.verificationAttempts',
        'user.lastCodeSentAt',
        'user.twoFactorSecret',
        'user.twoFactorRecoveryCodes',
        'user.twoFactorAttempts',
        'user.twoFactorLockoutUntil',
        'user.twoFactorLastStep',
      ])
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: number): Promise<User | null> {
    return await this.userRepository.findOne({ where: { id } });
  }

  async findByIdWithTwoFactorDetails(id: number): Promise<User | null> {
    return await this.userRepository
      .createQueryBuilder('user')
      .addSelect([
        'user.password',
        'user.twoFactorSecret',
        'user.twoFactorRecoveryCodes',
        'user.twoFactorAttempts',
        'user.twoFactorLockoutUntil',
        'user.twoFactorLastStep',
      ])
      .where('user.id = :id', { id })
      .getOne();
  }

  async update(id: number, updateData: Partial<User>): Promise<void> {
    await this.userRepository.update(id, updateData);
  }
}
