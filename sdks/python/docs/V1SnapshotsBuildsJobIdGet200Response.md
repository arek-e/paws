# V1SnapshotsBuildsJobIdGet200Response

## Properties

| Name             | Type         | Description | Notes      |
| ---------------- | ------------ | ----------- | ---------- |
| **job_id**       | **str**      |             |
| **snapshot_id**  | **str**      |             |
| **status**       | **str**      |             |
| **started_at**   | **datetime** |             | [optional] |
| **completed_at** | **datetime** |             | [optional] |
| **error**        | **str**      |             | [optional] |

## Example

```python
from paws_client.models.v1_snapshots_builds_job_id_get200_response import V1SnapshotsBuildsJobIdGet200Response

# TODO update the JSON string below
json = "{}"
# create an instance of V1SnapshotsBuildsJobIdGet200Response from a JSON string
v1_snapshots_builds_job_id_get200_response_instance = V1SnapshotsBuildsJobIdGet200Response.from_json(json)
# print the JSON string representation of the object
print(V1SnapshotsBuildsJobIdGet200Response.to_json())

# convert the object into a dict
v1_snapshots_builds_job_id_get200_response_dict = v1_snapshots_builds_job_id_get200_response_instance.to_dict()
# create an instance of V1SnapshotsBuildsJobIdGet200Response from a dict
v1_snapshots_builds_job_id_get200_response_from_dict = V1SnapshotsBuildsJobIdGet200Response.from_dict(v1_snapshots_builds_job_id_get200_response_dict)
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
