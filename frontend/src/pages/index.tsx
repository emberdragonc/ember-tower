import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR issues with PixiJS
const Game = dynamic(() => import('../components/Game'), { ssr: false });

export default function Home() {
  return <Game />;
}
