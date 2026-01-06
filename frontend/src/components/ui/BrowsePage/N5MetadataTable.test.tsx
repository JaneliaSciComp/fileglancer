import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import N5MetadataTable from './N5MetadataTable';
import type { N5Metadata } from '@/queries/n5Queries';

const mockS0Attrs = {
    dataType: 'uint16',
    compression: { type: 'gzip' },
    blockSize: [64, 64, 64],
    dimensions: [100, 200, 300]
};

describe('N5MetadataTable', () => {
    it('should use explicit units and resolution when present (Standard N5)', () => {
        const metadata: N5Metadata = {
            rootAttrs: {
                n5: '2.0.0',
                units: ['nm', 'um', 'mm'],
                resolution: [10, 20, 30]
            },
            s0Attrs: mockS0Attrs,
            dataUrl: 'mock-url'
        };

        render(<N5MetadataTable metadata={metadata} />);

        // Check table headers
        expect(screen.getByText('Axis')).toBeInTheDocument();

        // X Axis
        expect(screen.getByText('X')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument(); // Resolution
        expect(screen.getByText('nm')).toBeInTheDocument(); // Unit

        // Y Axis
        expect(screen.getByText('Y')).toBeInTheDocument();
        expect(screen.getByText('20')).toBeInTheDocument(); // Resolution
        expect(screen.getByText('um')).toBeInTheDocument(); // Unit

        // Z Axis
        expect(screen.getByText('Z')).toBeInTheDocument();
        expect(screen.getByText('30')).toBeInTheDocument(); // Resolution
        expect(screen.getByText('mm')).toBeInTheDocument(); // Unit
    });

    it('should use pixelResolution when units/resolution are missing (Cellmap N5)', () => {
        const metadata: N5Metadata = {
            rootAttrs: {
                n5: '2.0.0',
                pixelResolution: {
                    unit: 'nm',
                    dimensions: [5, 5, 5]
                }
            },
            s0Attrs: mockS0Attrs,
            dataUrl: 'mock-url'
        };

        render(<N5MetadataTable metadata={metadata} />);

        // Check X Axis using more specific approach if needed, but 5 is unique here
        expect(screen.getByText('X')).toBeInTheDocument();
        expect(screen.getAllByText('5')).toHaveLength(3); // One for each resolution cell
        expect(screen.getAllByText('nm')).toHaveLength(3); // One for each unit cell
    });

    it('should prioritize units over pixelResolution.unit', () => {
        const metadata: N5Metadata = {
            rootAttrs: {
                n5: '2.0.0',
                units: ['km', 'km', 'km'], // Priority
                pixelResolution: {
                    unit: 'nm', // Should be ignored
                    dimensions: [1, 1, 1]
                }
            },
            s0Attrs: mockS0Attrs,
            dataUrl: 'mock-url'
        };

        render(<N5MetadataTable metadata={metadata} />);

        expect(screen.getAllByText('km')).toHaveLength(3);
        expect(screen.queryByText('nm')).not.toBeInTheDocument();
    });

    it('should prioritize resolution over pixelResolution.dimensions', () => {
        const metadata: N5Metadata = {
            rootAttrs: {
                n5: '2.0.0',
                resolution: [100, 100, 100], // Priority
                pixelResolution: {
                    unit: 'nm',
                    dimensions: [1, 1, 1] // Should be ignored
                }
            },
            s0Attrs: mockS0Attrs, // dimensions: [100, 200, 300]
            dataUrl: 'mock-url'
        };

        render(<N5MetadataTable metadata={metadata} />);

        // Total '100' instances:
        // 1 in Axis X Shape column
        // 3 in Axis table Resolution column
        // (Note: '100' in Dimensions string is part of "100, 200, 300" and not matched exactly)
        expect(screen.getAllByText('100')).toHaveLength(4);
        expect(screen.queryByText('1')).not.toBeInTheDocument();
    });

    it('should default to micrometers ("um") if no units specified', () => {
        const metadata: N5Metadata = {
            rootAttrs: {
                n5: '2.0.0',
                resolution: [1, 1, 1]
            },
            s0Attrs: mockS0Attrs,
            dataUrl: 'mock-url'
        };

        render(<N5MetadataTable metadata={metadata} />);

        expect(screen.getAllByText('um')).toHaveLength(3);
    });

    it('should use scales when downsamplingFactors is missing', () => {
        const metadata: N5Metadata = {
            rootAttrs: {
                n5: '2.0.0',
                scales: [[1, 1, 1], [2, 2, 2], [4, 4, 4]] // Length 3
            },
            s0Attrs: mockS0Attrs,
            dataUrl: 'mock-url'
        };

        render(<N5MetadataTable metadata={metadata} />);

        expect(screen.getByText('Multiscale Levels')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should prioritize downsamplingFactors over scales', () => {
        const metadata: N5Metadata = {
            rootAttrs: {
                n5: '2.0.0',
                downsamplingFactors: [[1], [2]], // Length 2 (Priority)
                scales: [[1], [2], [3], [4]] // Length 4
            },
            s0Attrs: mockS0Attrs,
            dataUrl: 'mock-url'
        };

        render(<N5MetadataTable metadata={metadata} />);

        expect(screen.getByText('Multiscale Levels')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.queryByText('4')).not.toBeInTheDocument();
    });
});
