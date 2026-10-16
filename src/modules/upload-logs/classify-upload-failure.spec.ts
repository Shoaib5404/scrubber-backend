import { BadRequestException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { classifyUploadFailure } from './upload-logs.service';

describe('classifyUploadFailure', () => {
  it('maps structural validation to a generic format message', () => {
    const err = new UnprocessableEntityException({
      message: 'EDI 837 structural validation failed',
      issues: [{ rule_id: 'COB', message: 'Patient name leaked' }],
    });
    expect(classifyUploadFailure(err)).toEqual({
      errorType: 'invalid_format',
      errorMessage: 'EDI file is not in a correct format.',
    });
  });

  it('maps a missing stored object to storage', () => {
    expect(
      classifyUploadFailure(new BadRequestException('Uploaded file was not found in storage.')),
    ).toEqual({
      errorType: 'storage',
      errorMessage: 'The uploaded file could not be read from storage.',
    });
  });

  it('maps other bad requests to invalid file', () => {
    expect(
      classifyUploadFailure(new BadRequestException('EDI file exceeds max size of 10 bytes')),
    ).toEqual({
      errorType: 'invalid_file',
      errorMessage: 'The uploaded file was rejected before it could be saved.',
    });
  });

  it('skips authorization failures', () => {
    expect(classifyUploadFailure(new ForbiddenException('nope'))).toBeNull();
  });

  it('maps unexpected errors without copying the exception text', () => {
    expect(classifyUploadFailure(new Error('NM1*IL*1*DOE*JANE'))).toEqual({
      errorType: 'unexpected',
      errorMessage: 'The upload could not be completed.',
    });
  });
});
