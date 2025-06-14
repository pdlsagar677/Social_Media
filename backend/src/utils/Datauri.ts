import DataUriParser from "datauri/parser.js";
import path from "path";

const parser = new DataUriParser();

const getDataUri = (file: Express.Multer.File): string | undefined => {
  const extName = path.extname(file.originalname).toString();
  return parser.format(extName, file.buffer).content;
};


export default getDataUri;
