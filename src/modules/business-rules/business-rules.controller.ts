import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { AuthPrincipal, CurrentAuth } from '../auth/auth.types';
import { BUSINESS_RULE_SCOPE, type BusinessRuleScope } from './business-rule-effective';
import { BusinessRulesService } from './business-rules.service';

class ListBusinessRulesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  per_page?: number = 25;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsIn(['on', 'off'])
  enabled?: 'on' | 'off';
}

class UpdateBusinessRuleDto {
  @IsIn([BUSINESS_RULE_SCOPE.Global, BUSINESS_RULE_SCOPE.User])
  scope!: BusinessRuleScope;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inherit?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}

class GrantBusinessRuleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  user_id!: number;
}

class GrantSearchQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

@ApiTags('business-rules')
@ApiBearerAuth()
@Controller('business-rules')
export class BusinessRulesController {
  constructor(private readonly rules: BusinessRulesService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthPrincipal, @Query() query: ListBusinessRulesQueryDto) {
    const data = await this.rules.list(auth, query);
    return { success: true, data };
  }

  @Patch(':ruleKey')
  async update(
    @CurrentAuth() auth: AuthPrincipal,
    @Param('ruleKey') ruleKey: string,
    @Body() body: UpdateBusinessRuleDto,
  ) {
    const data = await this.rules.update(auth, ruleKey, body);
    return { success: true, data };
  }
}

@ApiTags('business-rule-grants')
@ApiBearerAuth()
@Controller('business-rule-grants')
export class BusinessRuleGrantsController {
  constructor(private readonly rules: BusinessRulesService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthPrincipal, @Query() query: GrantSearchQueryDto) {
    const data = await this.rules.listGrants(auth, query.search);
    return { success: true, data };
  }

  @Post()
  async create(@CurrentAuth() auth: AuthPrincipal, @Body() body: GrantBusinessRuleDto) {
    const data = await this.rules.grant(auth, body.user_id);
    return { success: true, data };
  }

  @Delete(':id')
  async revoke(@CurrentAuth() auth: AuthPrincipal, @Param('id', ParseIntPipe) id: number) {
    const data = await this.rules.revoke(auth, id);
    return { success: true, data };
  }
}
