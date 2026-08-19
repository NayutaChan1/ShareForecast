import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, Length } from 'class-validator';

export class UpdateKeywordsDto {
  /**
   * The complete replacement list, not a delta — the editor sends what the
   * asset should end up with, which keeps add and remove on one code path.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(2, 64, { each: true })
  keywords: string[];
}
