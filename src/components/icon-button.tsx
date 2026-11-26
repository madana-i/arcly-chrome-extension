import type { ButtonHTMLAttributes } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function IconButton({ title, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) {
  return <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-xs" aria-label={title} className={cn('shrink-0 text-muted-foreground', className)} {...props}>{children}</Button></TooltipTrigger><TooltipContent side="bottom">{title}</TooltipContent></Tooltip>;
}
