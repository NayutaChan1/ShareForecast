import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateAssetDto {
  /**
   * Binance pair (ADAUSDT) or Yahoo ticker (TLKM.JK). The dot and dash are
   * allowed because Yahoo uses them for exchange suffixes and share classes.
   */
  @IsString()
  @Length(1, 32)
  @Matches(/^[A-Za-z0-9.\-]+$/, {
    message: 'symbol may only contain letters, digits, dots and dashes',
  })
  symbol: string;

  @IsString()
  @Length(1, 128)
  name: string;

  @IsIn(['crypto', 'stock'])
  type: 'crypto' | 'stock';

  /** Words that attach a news headline to this asset. */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(2, 64, { each: true })
  keywords: string[];
}
