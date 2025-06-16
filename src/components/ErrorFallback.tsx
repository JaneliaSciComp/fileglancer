import errorImg from '@/assets/error-icon.png';

export default function ErrorFallback({ error }: any) {
  if (error instanceof Error) {
    console.log(error);
    return (
      <div className="flex flex-col h-full gap-4 justify-center items-center">
        <h2 className="text-black dark:text-white text-4xl font-bold">
          Oops! An error occurred
        </h2>
        <p className="text-foreground">{error.message}</p>
        <div className="flex flex-col items-center pl-4">
          <img
            src={errorImg}
            alt="An icon showing a magnifying glass with a question mark hovering over an eye on a page"
            width="500px"
            height="500px"
            className="dark:bg-slate-50 rounded-full"
          />
        </div>
      </div>
    );
  } else {
    return (
      <div className="flex flex-col h-full gap-4 justify-center items-center">
        <h2 className="text-black dark:text-white text-4xl font-bold">
          Unknown error
        </h2>
        <div className="flex flex-col items-center pl-4">
          <img
            src={errorImg}
            alt="An icon showing a magnifying glass with a question mark hovering over an eye on a page"
            width="500px"
            height="500px"
            className="dark:bg-slate-50 rounded-full"
          />
        </div>
      </div>
    );
  }
}
