import { UserButton } from '@clerk/nextjs';

const Home = () => {
  return (
    <div>
      <div>home</div>
      <UserButton afterSignOutUrl='/' />
    </div>
  );
};

export default Home;