import * as React from 'react';
import { connect, Dispatch, MapStateToPropsFactory } from 'react-redux';
import { Menu, Dropdown, Icon, Button, Modal, TreeSelect, Input, Tooltip } from 'antd';
import { State } from '../../../state';
import RecordFolder from './record_folder';
import RecordItem from './record_item';
import CollectionItem from './collection_item';
import { DtoRecord } from '../../../../../api/interfaces/dto_record';
import * as _ from 'lodash';
import { DtoCollection } from '../../../../../api/interfaces/dto_collection';
import { RecordCategory } from '../../../common/record_category';
import { actionCreator } from '../../../action';
import { DeleteCollectionType, SaveCollectionType, SelectedProjectChangedType, CollectionOpenKeysType } from '../../../action/collection';
import { DeleteRecordType, SaveRecordType, RemoveTabType, ActiveRecordType, MoveRecordType, SaveAsRecordType } from '../../../action/record';
import { StringUtil } from '../../../utils/string_util';
import PerfectScrollbar from 'react-perfect-scrollbar';
import { ProjectSelectedDialogMode, ProjectSelectedDialogType } from '../../../common/custom_type';
import { getProjectsIdNameStateSelector, getDisplayCollectionSelector } from './selector';
import { newCollectionName, allProject } from '../../../common/constants';
import RecordTimeline from '../../../components/record_timeline';
import { ShowTimelineType, CloseTimelineType } from '../../../action/ui';
import ScriptDialog from '../../../components/script_dialog';
import Msg from '../../../locales';
import './style/index.less';
import LocalesString from '../../../locales/string';

const SubMenu = Menu.SubMenu;
const MenuItem = Menu.Item;

interface CollectionListStateProps {

    collections: DtoCollection[];

    records: _.Dictionary<_.Dictionary<DtoRecord>>;

    activeKey: string;

    projects: { id: string, name: string }[];

    openKeys: string[];

    selectedProject: string;

    timelineRecord?: DtoRecord;

    isTimelineDlgOpen: boolean;
}

interface CollectionListDispatchProps {

    activeRecord: (record: DtoRecord) => void;

    deleteRecord(id: string, records: _.Dictionary<DtoRecord>);

    deleteCollection(id: string);

    updateRecord(record: DtoRecord);

    saveCollection(collection: DtoCollection);

    updateCollection(collection: DtoCollection);

    duplicateRecord(record: DtoRecord);

    createRecord(record: DtoRecord);

    moveRecord(record: DtoRecord);

    openKeysChanged(openKeys: string[]);

    selectProject(projectid: string);

    showTimeLine(id: string);

    closeTimeLine();
}

type CollectionListProps = CollectionListStateProps & CollectionListDispatchProps;

interface CollectionListState {

    isProjectSelectedDlgOpen: boolean;

    projectSelectedDlgMode: ProjectSelectedDialogMode;

    selectedProjectInDlg?: string;

    newCollectionName: string;

    shareCollectionId: string;

    isScriptDlgOpen: boolean;

    currentOperatedCollection?: DtoCollection;
}

class CollectionList extends React.Component<CollectionListProps, CollectionListState> {

    private currentNewFolder: DtoRecord | undefined;
    private folderRefs: _.Dictionary<RecordFolder> = {};
    private newCollectionNameRef: Input;

    constructor(props: CollectionListProps) {
        super(props);
        this.state = {
            projectSelectedDlgMode: ProjectSelectedDialogType.create,
            isProjectSelectedDlgOpen: false,
            newCollectionName: newCollectionName(),
            shareCollectionId: '',
            isScriptDlgOpen: false
        };
    }

    componentDidUpdate(prevProps: CollectionListProps, prevState: CollectionListState) {
        if (this.currentNewFolder && this.folderRefs[this.currentNewFolder.id]) {
            this.folderRefs[this.currentNewFolder.id].edit();
            this.currentNewFolder = undefined;
        }
    }

    private createRecord = (record: DtoRecord) => {
        if (!record) {
            return;
        }

        this.currentNewFolder = record.category === RecordCategory.folder ? record : undefined;

        let openKeys = [...this.props.openKeys];
        if (record.collectionId && this.props.openKeys.indexOf(record.collectionId) < 0) {
            openKeys.push(record.collectionId);
        }
        if (record.pid && this.props.openKeys.indexOf(record.pid) < 0) {
            openKeys.push(record.pid);
        }
        if (openKeys.length !== this.props.openKeys.length) {
            this.props.openKeysChanged(openKeys);
        }

        this.props.createRecord(record);

        if (record && record.category === RecordCategory.record) {
            this.props.activeRecord(record);
        }
    }

    private changeFolderName = (folder: DtoRecord, name: string) => {
        if (name.trim() !== '' && name !== folder.name) {
            this.props.updateRecord({ ...folder, name });
        }
    }

    private changeCollectionName = (collection: DtoCollection, name: string) => {
        if (name.trim() !== '' && name !== collection.name) {
            this.props.updateCollection({ ...collection, name });
        }
    }

    private moveRecordToFolder = (record: DtoRecord, collectionId: string, folderId: string) => {
        this.props.moveRecord({ ...record, pid: folderId, collectionId });
    }

    private moveToCollection = (record: DtoRecord, collectionId: string) => {
        this.props.moveRecord({ ...record, collectionId, pid: '' });
        if (record.category === RecordCategory.folder) {
            _.values(this.props.records[record.collectionId]).filter(r => r.pid === record.id).forEach(r => {
                this.props.moveRecord({ ...r, collectionId });
            });
        }
    }

    private getProjectMenu = () => {
        const projects = this.props.projects;
        return (
            <Menu style={{ minWidth: 150 }} onClick={e => this.props.selectProject(e.key)} selectedKeys={[this.props.selectedProject]}>
                <Menu.Item key={allProject}>{allProject}</Menu.Item>
                {projects.map(t => <Menu.Item key={t.id}>{t.name}</Menu.Item>)}
            </Menu>
        );
    }

    private getCurrentProject = () => {
        return this.props.projects.find(t => t.id === this.props.selectedProject) || { id: allProject, name: allProject };
    }

    private addCollection = () => {
        this.setState({ ...this.state, isProjectSelectedDlgOpen: true }, () => this.newCollectionNameRef && this.newCollectionNameRef.focus());
    }

    private createCollection = () => {
        if (!this.state.selectedProjectInDlg) {
            return;
        }

        const collection: DtoCollection = {
            id: StringUtil.generateUID(),
            name: this.state.newCollectionName,
            commonPreScript: '',
            projectId: this.state.selectedProjectInDlg,
            description: ''
        };
        this.props.saveCollection(collection);
        this.setState({ ...this.state, isProjectSelectedDlgOpen: false, newCollectionName: newCollectionName(), selectedProjectInDlg: undefined });
    }

    private duplicateRecord = (record: DtoRecord) => {
        let headers = record.headers;
        let queryStrings = record.queryStrings;
        let formDatas = record.formDatas;
        if (headers) {
            headers = headers.map(h => ({ ...h, id: StringUtil.generateUID() }));
        }
        if (queryStrings) {
            queryStrings = queryStrings.map(q => ({ ...q, id: StringUtil.generateUID() }));
        }
        if (formDatas) {
            formDatas = formDatas.map(q => ({ ...q, id: StringUtil.generateUID() }));
        }
        this.props.duplicateRecord({ ...record, id: StringUtil.generateUID(), name: `${record.name}.copy`, headers, queryStrings, formDatas });
    }

    private shareCollection = () => {
        // TODO: share
        console.log('share');
    }

    private saveCommonPreScript = (code: string) => {
        const { currentOperatedCollection } = this.state;
        if (!currentOperatedCollection) {
            return;
        }
        this.props.updateCollection({ ...currentOperatedCollection, commonPreScript: code });
        this.setState({ ...this.state, isScriptDlgOpen: false });
    }

    private loopRecords = (data: DtoRecord[], cid: string, inFolder: boolean = false) => {
        const { openKeys, records, deleteRecord, showTimeLine } = this.props;

        return data.map(r => {
            const recordStyle = { height: '30px', lineHeight: '30px' };

            if (r.category === RecordCategory.folder) {
                const isOpen = openKeys.indexOf(r.id) > -1;
                const children = _.remove(data, (d) => d.pid === r.id);
                return (
                    <SubMenu
                        className="folder"
                        key={r.id}
                        title={(
                            <RecordFolder
                                ref={ele => this.folderRefs[r.id] = ele}
                                folder={{ ...r }}
                                isOpen={isOpen}
                                deleteRecord={() => deleteRecord(r.id, records[cid])}
                                createRecord={this.createRecord}
                                onNameChanged={(name) => this.changeFolderName(r, name)}
                                moveRecordToFolder={this.moveRecordToFolder}
                                moveToCollection={this.moveToCollection}
                            />
                        )}
                    >
                        {this.loopRecords(children, cid, true)}
                    </SubMenu>
                );
            }
            return (
                <MenuItem key={r.id} style={recordStyle} data={r}>
                    <RecordItem
                        record={{ ...r }}
                        inFolder={inFolder}
                        moveRecordToFolder={this.moveRecordToFolder}
                        moveToCollection={this.moveToCollection}
                        duplicateRecord={() => this.duplicateRecord(r)}
                        deleteRecord={() => deleteRecord(r.id, records[cid])}
                        showTimeline={() => showTimeLine(r.id)}
                    />
                </MenuItem>
            );
        });
    }

    private get timelineDialog() {
        const { timelineRecord, isTimelineDlgOpen, closeTimeLine } = this.props;
        return (
            <RecordTimeline
                visible={isTimelineDlgOpen}
                record={timelineRecord}
                onClose={closeTimeLine}
            />
        );
    }

    private get commonPreScriptDialog() {
        const { isScriptDlgOpen, currentOperatedCollection } = this.state;
        if (!currentOperatedCollection) {
            return;
        }
        return (
            <ScriptDialog
                title={`${currentOperatedCollection.name} - ${LocalesString.get('Collection.CommonPreRequestScript')}`}
                isOpen={isScriptDlgOpen}
                onOk={this.saveCommonPreScript}
                value={currentOperatedCollection.commonPreScript || ''}
                onCancel={() => this.setState({ ...this.state, isScriptDlgOpen: false })}
            />
        );
    }

    private get projectSelectedDialog() {
        const { projectSelectedDlgMode, isProjectSelectedDlgOpen } = this.state;
        const description = ProjectSelectedDialogType.getDescription(projectSelectedDlgMode);
        return (
            <Modal
                title={ProjectSelectedDialogType.getTitle(projectSelectedDlgMode)}
                visible={isProjectSelectedDlgOpen}
                onOk={ProjectSelectedDialogType.isCreateMode(projectSelectedDlgMode) ? this.createCollection : this.shareCollection}
                onCancel={() => this.setState({ ...this.state, isProjectSelectedDlgOpen: false })}
            >
                {
                    ProjectSelectedDialogType.isCreateMode(projectSelectedDlgMode) ? (
                        <div>
                            <div style={{ marginBottom: '8px' }}>{Msg('Collection.EnterNewCollectionName')}</div>
                            <Input spellCheck={false} ref={ele => this.newCollectionNameRef = ele} style={{ width: '100%', marginBottom: '8px' }} value={this.state.newCollectionName} onChange={e => this.setState({ ...this.state, newCollectionName: e.currentTarget.value })} />
                        </div>
                    ) : ''
                }

                <div style={{ marginBottom: '8px' }}>{description}</div>
                <TreeSelect
                    allowClear={true}
                    style={{ width: '100%' }}
                    dropdownStyle={{ maxHeight: 500, overflow: 'auto' }}
                    placeholder={LocalesString.get('Collection.SelectProject')}
                    treeDefaultExpandAll={true}
                    value={this.state.selectedProjectInDlg}
                    onChange={(e) => this.setState({ ...this.state, selectedProjectInDlg: e })}
                    treeData={this.props.projects.map(t => ({ key: t.id, value: t.id, label: t.name }))}
                />
            </Modal>
        );
    }

    private get collectionMenu() {
        const { collections, records, activeKey, openKeys, deleteCollection, openKeysChanged, activeRecord } = this.props;

        return (
            <div className="collection-tree-container">
                <PerfectScrollbar>
                    <Menu
                        className="collection-tree"
                        onOpenChange={openKeysChanged}
                        mode="inline"
                        inlineIndent={0}
                        openKeys={openKeys}
                        selectedKeys={[activeKey]}
                        onSelect={param => activeRecord(param.item.props.data)}
                    >
                        {
                            collections.map(c => {
                                const recordCount = _.values(records[c.id]).filter(r => r.category === RecordCategory.record).length;
                                let sortRecords = _.chain(records[c.id]).values<DtoRecord>().sortBy(['category', 'name']).value();

                                return (
                                    <SubMenu
                                        className={`${c.id !== collections[0].id ? 'collection-separator-line' : ''} collection-item`}
                                        key={c.id}
                                        title={(
                                            <CollectionItem
                                                collection={{ ...c }}
                                                recordCount={recordCount}
                                                onNameChanged={(name) => this.changeCollectionName(c, name)}
                                                deleteCollection={() => deleteCollection(c.id)}
                                                moveToCollection={this.moveToCollection}
                                                createRecord={this.createRecord}
                                                shareCollection={id => this.setState({ ...this.state, isProjectSelectedDlgOpen: true, projectSelectedDlgMode: ProjectSelectedDialogType.share, shareCollectionId: id })}
                                                editPreRequestScript={() => this.setState({ ...this.state, isScriptDlgOpen: true, currentOperatedCollection: c })}
                                                editReqStrictSSL={() => this.props.updateCollection({ ...c, reqStrictSSL: !c.reqStrictSSL })}
                                                editReqFollowRedirect={() => this.props.updateCollection({ ...c, reqFollowRedirect: !c.reqFollowRedirect })}
                                            />
                                        )}
                                    >
                                        {
                                            sortRecords.length === 0 ?
                                                <div style={{ height: 20 }} /> :
                                                this.loopRecords(sortRecords, c.id)
                                        }
                                    </SubMenu>
                                );
                            })
                        }
                    </Menu>
                    {collections.length === 0 ? '' : <div className="collection-tree-bottom" />}
                </PerfectScrollbar>
            </div>
        );
    }

    private get collectionHeader() {
        return (
            <div className="small-toolbar">
                <span>{Msg('App.Project')}:</span>
                <span>
                    <Dropdown overlay={this.getProjectMenu()} trigger={['click']} style={{ width: 200 }}>
                        <a className="ant-dropdown-link" href="#">
                            {this.getCurrentProject().name} <Icon type="down" />
                        </a>
                    </Dropdown>
                </span>
                <Tooltip mouseEnterDelay={1} placement="bottom" title={Msg('Collection.Create')}>
                    <Button className="icon-btn" type="primary" icon="folder-add" onClick={this.addCollection} />
                </Tooltip>
            </div>
        );
    }

    render() {
        return (
            <div className="collection-panel">
                {this.collectionHeader}
                {this.collectionMenu}
                {this.projectSelectedDialog}
                {this.timelineDialog}
                {this.commonPreScriptDialog}
            </div>
        );
    }
}

const makeMapStateToProps: MapStateToPropsFactory<any, any> = (initialState: any, ownProps: any) => {
    const getProjects = getProjectsIdNameStateSelector();
    const getCollections = getDisplayCollectionSelector();

    const mapStateToProps: (state: State) => CollectionListStateProps = state => {
        const { collectionsInfo, selectedProject } = state.collectionState;
        const { record, isShow } = state.uiState.timelineState;

        return {
            collections: getCollections(state),
            records: collectionsInfo.records,
            activeKey: state.displayRecordsState.activeKey,
            projects: getProjects(state),
            openKeys: state.collectionState.openKeys,
            selectedProject,
            timelineRecord: record,
            isTimelineDlgOpen: isShow
        };
    };
    return mapStateToProps;
};

const mapDispatchToProps = (dispatch: Dispatch<{}>): CollectionListDispatchProps => {
    return {
        activeRecord: (record) => dispatch(actionCreator(ActiveRecordType, record)),
        deleteRecord: (id, records) => {
            const record = records[id];
            if (record.category === RecordCategory.folder) {
                const children = _.values(records).filter(r => r.pid === id);
                children.forEach(r => dispatch(actionCreator(RemoveTabType, r.id)));
            }
            dispatch(actionCreator(RemoveTabType, id));
            dispatch(actionCreator(DeleteRecordType, record));
        },
        deleteCollection: id => { dispatch(actionCreator(DeleteCollectionType, id)); },
        updateRecord: (record) => dispatch(actionCreator(SaveRecordType, { isNew: false, record })),
        saveCollection: (collection) => { dispatch(actionCreator(SaveCollectionType, { isNew: true, collection })); },
        updateCollection: (collection) => { dispatch(actionCreator(SaveCollectionType, { isNew: false, collection })); },
        duplicateRecord: (record) => dispatch(actionCreator(SaveAsRecordType, { isNew: true, record })),
        createRecord: (record) => dispatch(actionCreator(SaveAsRecordType, { isNew: true, record })),
        moveRecord: record => dispatch(actionCreator(MoveRecordType, { record })),
        openKeysChanged: openKeys => dispatch(actionCreator(CollectionOpenKeysType, openKeys)),
        selectProject: projectId => dispatch(actionCreator(SelectedProjectChangedType, projectId)),
        showTimeLine: id => dispatch(actionCreator(ShowTimelineType, id)),
        closeTimeLine: () => dispatch(actionCreator(CloseTimelineType))
    };
};

export default connect(
    makeMapStateToProps,
    mapDispatchToProps,
)(CollectionList);