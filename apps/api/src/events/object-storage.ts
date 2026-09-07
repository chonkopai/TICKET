export interface PosterObject {
  key: string;
  url: string;
}

export interface ReadablePosterObject {
  body: Buffer;
  contentType: string;
}

export interface PutPosterInput {
  body: Buffer;
  contentType: string;
  extension: "jpg" | "png" | "webp";
}

export interface ObjectStorage {
  putPoster(input: PutPosterInput): Promise<PosterObject>;
  readPoster(key: string): Promise<ReadablePosterObject>;
  deletePoster(key: string): Promise<void>;
}

export interface UploadedPoster {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}
