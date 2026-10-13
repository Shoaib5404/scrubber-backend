import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { StaffOnlyGuard } from '../../common/guards/staff-only.guard';
import {
  ArticlesShowService,
  parseRequestedArticleVersion,
} from './articles-show.service';

@ApiTags('admin-references')
@ApiBearerAuth()
@UseGuards(StaffOnlyGuard)
@Controller('admin/references/articles')
export class ArticlesShowController {
  constructor(private readonly articlesShow: ArticlesShowService) {}

  @Get('by-number/:articleId')
  @ApiQuery({ name: 'ver', required: false, description: 'Medicare article_version snapshot' })
  async showByMedicareNumber(
    @Param('articleId') articleIdRaw: string,
    @Query('ver') verRaw?: string,
  ) {
    const articleId = Number(articleIdRaw);
    if (!Number.isInteger(articleId) || articleId <= 0) {
      throw new BadRequestException('Invalid Medicare article number.');
    }

    const requestedVersion = parseRequestedArticleVersion(verRaw);
    const data = await this.articlesShow.showByMedicareNumber({
      articleId,
      requestedVersion,
    });

    return { success: true, data };
  }
}
