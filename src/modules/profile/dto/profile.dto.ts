import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({ example: 'Mehmood' })
  @IsNotEmpty()
  @IsString()
  first_name: string;

  @ApiProperty({ example: 'Hussain' })
  @IsNotEmpty()
  @IsString()
  last_name: string;
}

export class UpdateAvatarDto {
  @ApiProperty({ example: 'url' })
  @IsNotEmpty()
  @IsString()
  url: string;
}
