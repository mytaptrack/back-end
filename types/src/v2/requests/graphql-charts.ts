export interface QLChartDataset {
    data: number[] | number[][];
    label: string;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    fill?: boolean;
    type?: string;
    pointRadius?: number;
    lineTension?: number;
    yAxisID?: string;
}

export interface QLReportChartDetails {
    datasets: QLChartDataset[];
    labels: string[];
    maxValue: number;
    minValue: number;
    chartType: string;
    beginAt0: boolean;
    xAxisMax: number;
    minStep?: number;
  }