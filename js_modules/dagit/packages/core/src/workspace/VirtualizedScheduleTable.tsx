import {gql, useLazyQuery} from '@apollo/client';
import {Box, Button, Caption, Colors, Icon, Menu, Popover, Tag, Tooltip} from '@dagster-io/ui';
import {useVirtualizer} from '@tanstack/react-virtual';
import * as React from 'react';
import {Link} from 'react-router-dom';
import styled from 'styled-components/macro';

import {LastRunSummary} from '../instance/LastRunSummary';
import {TickTag, TICK_TAG_FRAGMENT} from '../instigation/InstigationTick';
import {PipelineReference} from '../pipelines/PipelineReference';
import {RepoSectionHeader} from '../runs/RepoSectionHeader';
import {RUN_TIME_FRAGMENT} from '../runs/RunUtils';
import {ScheduleSwitch, SCHEDULE_SWITCH_FRAGMENT} from '../schedules/ScheduleSwitch';
import {errorDisplay} from '../schedules/SchedulesTable';
import {TimestampDisplay} from '../schedules/TimestampDisplay';
import {humanCronString} from '../schedules/humanCronString';
import {InstigationStatus, InstigationType} from '../types/globalTypes';
import {MenuLink} from '../ui/MenuLink';
import {Container, Inner, Row, RowCell} from '../ui/VirtualizedTable';
import {useRepoExpansionState} from '../ui/useRepoExpansionState';

import {isThisThingAJob, useRepository} from './WorkspaceContext';
import {repoAddressAsString} from './repoAddressAsString';
import {RepoAddress} from './types';
import {SingleScheduleQuery, SingleScheduleQueryVariables} from './types/SingleScheduleQuery';
import {workspacePathFromAddress} from './workspacePath';

type Repository = {
  repoAddress: RepoAddress;
  schedules: string[];
};

interface Props {
  repos: Repository[];
}

type RowType =
  | {type: 'header'; repoAddress: RepoAddress; scheduleCount: number}
  | {type: 'schedule'; repoAddress: RepoAddress; name: string};

const SCHEDULES_EXPANSION_STATE_STORAGE_KEY = 'schedules-virtualized-expansion-state';

export const VirtualizedScheduleTable: React.FC<Props> = ({repos}) => {
  const parentRef = React.useRef<HTMLDivElement | null>(null);
  const {expandedKeys, onToggle} = useRepoExpansionState(SCHEDULES_EXPANSION_STATE_STORAGE_KEY);

  const flattened: RowType[] = React.useMemo(() => {
    const flat: RowType[] = [];
    repos.forEach(({repoAddress, schedules}) => {
      flat.push({type: 'header', repoAddress, scheduleCount: schedules.length});
      const repoKey = repoAddressAsString(repoAddress);
      if (expandedKeys.includes(repoKey)) {
        schedules.forEach((name) => {
          flat.push({type: 'schedule', repoAddress, name});
        });
      }
    });
    return flat;
  }, [repos, expandedKeys]);

  const rowVirtualizer = useVirtualizer({
    count: flattened.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (ii: number) => {
      const row = flattened[ii];
      return row?.type === 'header' ? 32 : 64;
    },
    overscan: 10,
  });

  const totalHeight = rowVirtualizer.getTotalSize();
  const items = rowVirtualizer.getVirtualItems();

  return (
    <Container ref={parentRef}>
      <Inner $totalHeight={totalHeight}>
        {items.map(({index, key, size, start}) => {
          const row: RowType = flattened[index];
          const type = row!.type;
          return type === 'header' ? (
            <RepoRow
              repoAddress={row.repoAddress}
              jobCount={row.scheduleCount}
              key={key}
              height={size}
              start={start}
              onToggle={onToggle}
            />
          ) : (
            <ScheduleRow
              key={key}
              name={row.name}
              repoAddress={row.repoAddress}
              height={size}
              start={start}
            />
          );
        })}
      </Inner>
    </Container>
  );
};

const RepoRow: React.FC<{
  repoAddress: RepoAddress;
  jobCount: number;
  height: number;
  start: number;
  onToggle: (repoAddress: RepoAddress) => void;
}> = ({repoAddress, jobCount, height, start, onToggle}) => {
  return (
    <Row $height={height} $start={start}>
      <RepoSectionHeader
        repoName={repoAddress.name}
        repoLocation={repoAddress.location}
        expanded
        onClick={() => onToggle(repoAddress)}
        showLocation={false}
        rightElement={<Tag intent="primary">{jobCount}</Tag>}
      />
    </Row>
  );
};

const JOB_QUERY_DELAY = 300;

interface ScheduleRowProps {
  name: string;
  repoAddress: RepoAddress;
  height: number;
  start: number;
}

const ScheduleRow = (props: ScheduleRowProps) => {
  const {name, repoAddress, start, height} = props;

  const repo = useRepository(repoAddress);

  const [queryJob, {data, loading}] = useLazyQuery<
    SingleScheduleQuery,
    SingleScheduleQueryVariables
  >(SINGLE_SCHEDULE_QUERY, {
    fetchPolicy: 'cache-and-network',
    variables: {
      selector: {
        repositoryName: repoAddress.name,
        repositoryLocationName: repoAddress.location,
        scheduleName: name,
      },
    },
  });

  React.useEffect(() => {
    const timer = setTimeout(() => {
      queryJob();
    }, JOB_QUERY_DELAY);

    return () => clearTimeout(timer);
  }, [queryJob, name]);

  const scheduleData = React.useMemo(() => {
    if (data?.scheduleOrError.__typename !== 'Schedule') {
      return null;
    }

    return data.scheduleOrError;
  }, [data]);

  const isJob = !!(scheduleData && isThisThingAJob(repo, scheduleData.pipelineName));

  return (
    <Row $height={height} $start={start}>
      <RowGrid border={{side: 'bottom', width: 1, color: Colors.KeylineGray}}>
        <RowCell>
          {scheduleData ? (
            <Box flex={{direction: 'column', gap: 4}}>
              {/* Keyed so that a new switch is always rendered, otherwise it's reused and animates on/off */}
              <ScheduleSwitch key={name} repoAddress={repoAddress} schedule={scheduleData} />
              {errorDisplay(
                scheduleData.scheduleState.status,
                scheduleData.scheduleState.runningCount,
              )}
            </Box>
          ) : null}
        </RowCell>
        <RowCell>
          <Box flex={{direction: 'column', gap: 4}}>
            <span style={{fontWeight: 500}}>
              <Link to={workspacePathFromAddress(repoAddress, `/schedules/${name}`)}>{name}</Link>
            </span>
            {scheduleData ? (
              <Caption>
                <PipelineReference
                  showIcon
                  size="small"
                  pipelineName={scheduleData.pipelineName}
                  pipelineHrefContext={repoAddress}
                  isJob={isJob}
                />
              </Caption>
            ) : null}
          </Box>
        </RowCell>
        <RowCell>
          {scheduleData ? (
            <Box flex={{direction: 'column', gap: 4}}>
              <Tooltip position="bottom" content={scheduleData.cronSchedule}>
                <span style={{color: Colors.Dark}}>
                  {humanCronString(
                    scheduleData.cronSchedule,
                    scheduleData.executionTimezone || 'UTC',
                  )}
                </span>
              </Tooltip>
              <Caption>
                Next tick:&nbsp;
                {scheduleData.scheduleState.nextTick &&
                scheduleData.scheduleState.status === InstigationStatus.RUNNING ? (
                  <TimestampDisplay
                    timestamp={scheduleData.scheduleState.nextTick.timestamp}
                    timezone={scheduleData.executionTimezone}
                    timeFormat={{showSeconds: false, showTimezone: true}}
                  />
                ) : (
                  'None'
                )}
              </Caption>
            </Box>
          ) : (
            <div style={{color: Colors.Gray500}}>{loading && !data ? 'Loading' : 'None'}</div>
          )}
        </RowCell>
        <RowCell>
          {scheduleData?.scheduleState.ticks.length ? (
            <div>
              <TickTag
                tick={scheduleData.scheduleState.ticks[0]}
                instigationType={InstigationType.SCHEDULE}
              />
            </div>
          ) : (
            <div style={{color: Colors.Gray500}}>{loading && !data ? 'Loading' : 'None'}</div>
          )}
        </RowCell>
        <RowCell>
          {scheduleData?.scheduleState && scheduleData?.scheduleState.runs.length > 0 ? (
            <LastRunSummary
              run={scheduleData.scheduleState.runs[0]}
              name={name}
              showButton={false}
              showHover
            />
          ) : (
            <div style={{color: Colors.Gray500}}>{loading && !data ? 'Loading' : 'None'}</div>
          )}
        </RowCell>
        <RowCell>
          {scheduleData?.partitionSet ? (
            <Popover
              content={
                <Menu>
                  <MenuLink
                    text="View partition history"
                    icon="dynamic_feed"
                    target="_blank"
                    to={workspacePathFromAddress(
                      repoAddress,
                      `/${isJob ? 'jobs' : 'pipelines'}/${scheduleData.pipelineName}/partitions`,
                    )}
                  />
                  <MenuLink
                    text="Launch partition backfill"
                    icon="add_circle"
                    target="_blank"
                    to={workspacePathFromAddress(
                      repoAddress,
                      `/${isJob ? 'jobs' : 'pipelines'}/${scheduleData.pipelineName}/partitions`,
                    )}
                  />
                </Menu>
              }
              position="bottom-left"
            >
              <Button icon={<Icon name="expand_more" />} />
            </Popover>
          ) : (
            <div style={{color: Colors.Gray500}}>{loading && !data ? 'Loading' : 'None'}</div>
          )}
        </RowCell>
      </RowGrid>
    </Row>
  );
};

const RowGrid = styled(Box)`
  display: grid;
  grid-template-columns: 76px 28% 30% 10% 20% 10%;
  height: 100%;
`;

const SINGLE_SCHEDULE_QUERY = gql`
  query SingleScheduleQuery($selector: ScheduleSelector!) {
    scheduleOrError(scheduleSelector: $selector) {
      ... on Schedule {
        id
        name
        pipelineName
        description
        scheduleState {
          id
          runningCount
          ticks(limit: 1) {
            id
            ...TickTagFragment
          }
          runs(limit: 1) {
            id
            ...RunTimeFragment
          }
          nextTick {
            timestamp
          }
        }
        partitionSet {
          id
          name
        }
        ...ScheduleSwitchFragment
      }
    }
  }

  ${SCHEDULE_SWITCH_FRAGMENT}
  ${TICK_TAG_FRAGMENT}
  ${RUN_TIME_FRAGMENT}
`;
