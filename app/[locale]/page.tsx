import type { Metadata } from 'next';
import { SinglePageApp } from '@/components/app/SinglePageApp';

export const metadata: Metadata = {
  title: 'Dimensionamento | Calculadora SolaX',
  description: 'Simulação residencial para dimensionamento de sistemas híbridos SolaX.',
};

export default function HomePage() {
  return <SinglePageApp />;
}
