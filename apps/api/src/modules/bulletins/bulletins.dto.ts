import { ArrayMaxSize, ArrayMinSize, ArrayUnique, Equals, IsArray, IsIn, IsString, Length, Matches } from 'class-validator';
export class BulletinDraftDto {
 @IsString() @Length(3,180) @Matches(/^[^\r\n\u0000-\u001f]+$/) subject!:string;
 @IsString() @Length(10,10000) @Matches(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f]*$/) body!:string;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(2) @ArrayUnique() @IsIn(['ORCAPRO','INFRA'],{each:true}) products!:string[];
 @IsIn(['ACTIVE','INACTIVE','ALL']) accountStatus!:string;
}
export class BulletinConfirmDto {
 @Equals('ENVIAR INFORMATIVO') confirmation!:string;
 @IsString() @Matches(/^[a-f0-9]{64}$/) audienceHash!:string;
}
